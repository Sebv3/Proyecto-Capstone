import http from 'k6/http';
import { check, fail, sleep } from 'k6';
import { Counter } from 'k6/metrics';

const mode = __ENV.TARGET_MODE || 'isolated';
const profile = __ENV.PROFILE || 'smoke';
if (!['isolated', 'integration'].includes(mode)) throw new Error('TARGET_MODE inválido');
if (!['smoke', 'load'].includes(profile)) throw new Error('PROFILE debe ser smoke o load');
const base = (__ENV.BASE_URL || 'http://perf-api:8080/api/v1').replace(/\/+$/, '');
if (!/^https?:\/\/[^?#]+\/api\/v1$/.test(base)) throw new Error('BASE_URL debe terminar en /api/v1');
if (mode === 'integration' && __ENV.CONFIRM_TEST_ENV !== 'yes') {
  throw new Error('Integration requiere CONFIRM_TEST_ENV=yes y un backend/base de pruebas');
}
const clientToken = mode === 'isolated' ? 'fixture-client' : __ENV.CLIENT_TOKEN;
const workerToken = mode === 'isolated' ? 'fixture-worker' : __ENV.WORKER_TOKEN;
const bookingId = mode === 'isolated' ? 'dddddddd-eeee-4fff-8aaa-bbbbbbbbbbbb' : __ENV.BOOKING_ID;
const serviceId = mode === 'isolated' ? 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff' : __ENV.SERVICE_ID;
const month = __ENV.MONTH || '2026-10';
if (!clientToken || !workerToken || !bookingId || !serviceId) throw new Error('Faltan cuentas o identificadores de pruebas');
if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('MONTH inválido');
for (const id of [bookingId, serviceId]) {
  if (!/^[a-f\d]{8}(-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(id)) throw new Error('Identificador de prueba inválido');
}
const endpoints = ['categories', 'catalog', 'search', 'service_detail', 'client_requests',
  'worker_requests', 'tracking', 'chat', 'earnings'];
const endpointRequests = new Counter('endpoint_requests');
const thresholds = {
  http_req_failed: ['rate<0.01'],
  checks: ['rate>0.99'],
};
for (const endpoint of endpoints) {
  // Both criteria are needed: an unvisited endpoint must not silently pass.
  thresholds[`http_req_duration{endpoint:${endpoint}}`] = ['p(95)<1000'];
  thresholds[`endpoint_requests{endpoint:${endpoint}}`] = ['count>0'];
}
export const options = {
  scenarios: {
    users: profile === 'smoke'
      ? { executor: 'constant-vus', vus: 1, duration: '15s', gracefulStop: '15s' }
      : { executor: 'ramping-vus', startVUs: 1, gracefulRampDown: '15s', gracefulStop: '15s',
          stages: [
            { duration: '10s', target: 1 }, { duration: '5s', target: 5 }, { duration: '15s', target: 5 },
            { duration: '5s', target: 10 }, { duration: '15s', target: 10 },
            { duration: '5s', target: 20 }, { duration: '20s', target: 20 }, { duration: '5s', target: 0 },
          ] },
  },
  thresholds,
  summaryTrendStats: ['avg', 'med', 'p(95)', 'p(99)', 'max'],
  // Do not save real URLs, identifiers or account tokens in summaries/metric tags.
  systemTags: ['status', 'method', 'name', 'scenario', 'expected_response'],
  discardResponseBodies: false,
  maxRedirects: 0,
};

function read(endpoint, path, token, valid) {
  const response = http.get(base + path, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    tags: { endpoint, name: endpoint }, timeout: '10s',
  });
  endpointRequests.add(1, { endpoint });
  let body = null;
  try { body = response.json(); } catch (_) { /* counted as a failed check below */ }
  const okay = check(response, {
    [`${endpoint}: HTTP 200 y contrato válido`]: (r) => {
      try { return r.status === 200 && valid(body); } catch (_) { return false; }
    },
  });
  return okay;
}
const reads = {
  categories: () => read('categories', '/categorias', null, (b) => Array.isArray(b) && b.length > 0),
  catalog: () => read('catalog', '/servicios?limit=20&offset=0', null, (b) => Array.isArray(b.items) && b.items.length > 0 && b.limit === 20),
  search: () => read('search', '/servicios?q=puerta&limit=20&offset=0', null, (b) => Array.isArray(b.items) && typeof b.total === 'number'),
  service_detail: () => read('service_detail', `/servicios/${serviceId}`, null, (b) => b.id === serviceId && b.precio_base > 0),
  client_requests: () => read('client_requests', '/solicitudes?vista=activas&limit=20&offset=0', clientToken, (b) => Array.isArray(b) && b.length > 0 && b.every((row) => row.id && row.estado)),
  worker_requests: () => read('worker_requests', '/solicitudes?vista=activas&limit=20&offset=0', workerToken, (b) => Array.isArray(b) && b.length > 0 && b.every((row) => row.id && row.estado)),
  tracking: () => read('tracking', `/solicitudes/${bookingId}`, clientToken, (b) => b.id === bookingId && b.estado),
  chat: () => read('chat', `/solicitudes/${bookingId}/chat?limit=50&offset=0`, clientToken,
    (b) => b.solicitud_id === bookingId && !!b.conversacion_id && Array.isArray(b.items) && b.items.length > 0 && b.limit === 50),
  earnings: () => read('earnings', `/trabajadores/me/ganancias?mes=${month}&limit=20&offset=0`, workerToken,
    (b) => b.mes === month && b.moneda === 'CLP' && Array.isArray(b.items)),
};

export function setup() {
  if (mode === 'isolated') {
    const marker = http.get(base.replace(/\/api\/v1$/, '') + '/__performance', { tags: { name: 'fixture_marker' }, timeout: '5s' });
    let isolated = false;
    try { isolated = marker.status === 200 && marker.json('mode') === 'isolated-read-only'; } catch (_) { /* fail closed */ }
    if (!isolated) fail('No es el entorno aislado. Se abortó antes de generar carga.');
  }
  // Validate fixture data, ownership and sessions before generating concurrent traffic.
  for (const endpoint of endpoints) if (!reads[endpoint]()) fail(`Preflight falló: ${endpoint}. No se ejecutará carga.`);
}

export default function () {
  const journey = (__ITER + __VU - 1) % 4;
  if (journey === 0) { reads.categories(); reads.catalog(); reads.search(); reads.service_detail(); sleep(1); }
  if (journey === 1) { reads.client_requests(); reads.tracking(); sleep(1); }
  if (journey === 2) { reads.worker_requests(); reads.earnings(); sleep(1); }
  if (journey === 3) {
    // Three successive polls, separated by the app's actual polling interval.
    for (let poll = 0; poll < 3; poll++) { reads.chat(); sleep(3); }
  }
}

export function handleSummary(data) {
  const rows = endpoints.map((endpoint) => {
    const latency = data.metrics[`http_req_duration{endpoint:${endpoint}}`]?.values || {};
    const count = data.metrics[`endpoint_requests{endpoint:${endpoint}}`]?.values.count || 0;
    return { endpoint, requests: count, avg_ms: latency.avg ?? null,
      p95_ms: latency['p(95)'] ?? null, p99_ms: latency['p(99)'] ?? null };
  });
  const failedThresholds = Object.entries(data.metrics).flatMap(([metric, value]) =>
    Object.entries(value.thresholds || {}).filter(([, result]) => !result.ok).map(([rule]) => `${metric}: ${rule}`));
  const report = { generated_at: new Date().toISOString(), mode, profile,
    passed: failedThresholds.length === 0, failed_thresholds: failedThresholds,
    http_requests: data.metrics.http_reqs?.values.count || 0,
    http_error_rate: data.metrics.http_req_failed?.values.rate ?? null,
    check_pass_rate: data.metrics.checks?.values.rate ?? null,
    peak_vus: data.metrics.vus?.values.max ?? null,
    completed_iterations: data.metrics.iterations?.values.count || 0,
    dropped_iterations: data.metrics.dropped_iterations?.values.count || 0,
    endpoints: rows,
    limitation: mode === 'isolated' ? 'FastAPI real; Supabase ficticio. No mide SQL, RLS, red externa ni Mercado Pago.' : 'Lecturas de un entorno de integración configurado explícitamente.',
  };
  const text = [
    `ServiMatch SCRUM-69 | ${mode} | ${profile} | ${report.passed ? 'PASS' : 'FAIL'}`,
    `HTTP: ${report.http_requests}; errores: ${report.http_error_rate}; checks: ${report.check_pass_rate}`,
    'endpoint | requests | avg ms | p95 ms | p99 ms',
    ...rows.map((row) => `${row.endpoint} | ${row.requests} | ${row.avg_ms?.toFixed(2)} | ${row.p95_ms?.toFixed(2)} | ${row.p99_ms?.toFixed(2)}`),
    ...failedThresholds, report.limitation, '',
  ].join('\n');
  const prefix = __ENV.OUTPUT_PREFIX || '/results/' + profile;
  return { stdout: text, [prefix + '.json']: JSON.stringify(report, null, 2), [prefix + '.txt']: text };
}
