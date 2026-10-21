// Isolated visual QA only. Fake accounts and data; never calls Supabase.
import http from 'node:http';
const client = '55555555-5555-4555-8555-555555555555';
const worker = '11111111-1111-4111-8111-111111111111';
const workerPreview = process.env.PREVIEW_ROLE === 'TRABAJADOR';
const mpPreview = process.env.PREVIEW_MERCADOPAGO === 'true';
const listCount = Math.min(5000, Math.max(1, Number(process.env.PREVIEW_LIST_COUNT || 1)));
const chatCount = Math.min(5000, Math.max(0, Number(process.env.PREVIEW_CHAT_COUNT || 0)));
let checkout = null;
const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(15, 0, 0, 0);
const booking = { id: '2847aaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', servicio_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', cliente_id: client, trabajador_id: worker,
  cliente_nombre: 'Ana González', servicio_nombre: 'Destape de cañerías', precio_base: 25000, duracion_estimada_minutos: 60, modalidad: 'DOMICILIO', inicio_en: tomorrow.toISOString(),
  ubicacion_servicio: 'Dirección de demostración', comuna_servicio_nombre: 'Santiago', estado: 'PENDIENTE', creado_en: new Date().toISOString(), actualizado_en: new Date().toISOString() };
let conversation = null;
let messages = Array.from({ length: chatCount }, (_, index) => ({
  id: `eeeeeeee-eeee-4eee-8eee-${String(index + 1).padStart(12, '0')}`,
  conversacion_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', autor_id: index % 2 ? worker : client,
  contenido: `Mensaje de demostración ${index + 1}`, creado_en: new Date(Date.now() - (chatCount - index) * 60000).toISOString(), editado_en: null,
}));
let review = null;
const page = (params = new URLSearchParams()) => {
  const limit = Number(params.get('limit') || 50), offset = Number(params.get('offset') || 0);
  return { solicitud_id: booking.id, conversacion_id: conversation, contraparte_nombre: 'Juan Pérez', servicio_nombre: booking.servicio_nombre,
    items: [...messages].reverse().slice(offset, offset + limit).reverse(), limit, offset, has_more: messages.length > offset + limit };
};
http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Headers', '*'); res.setHeader('Access-Control-Allow-Methods', '*');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  let raw = ''; for await (const chunk of req) raw += chunk;
  const body = raw ? JSON.parse(raw) : {};
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname.replace('/api/v1', '');
  let result = {}, status = 200;
  if (path === '/auth/login' || path === '/auth/refresh') result = { access_token: 'preview-only', refresh_token: 'preview-only', token_type: 'bearer', expires_in: 3600 };
  else if (path === '/auth/me') result = { user: { id: workerPreview ? worker : client, nombre: workerPreview ? 'Juan Pérez' : 'Ana González', email: 'preview@example.test', telefono: null, rol: workerPreview ? 'TRABAJADOR' : 'CLIENTE', activo: true } };
  else if (path === '/perfiles/trabajador') result = { usuario_id: worker, direccion_base: 'Dirección ficticia', comuna: { id: 'demo', nombre: 'Santiago' } };
  else if (path === '/verificaciones/trabajador') result = { trabajador_id: worker, estado: 'APROBADA' };
  else if (path === '/trabajador/servicios' || path === '/solicitudes/proximas') result = [];
  else if (path === '/trabajadores/me/ganancias') {
    const month = url.searchParams.get('mes'); const offset = Number(url.searchParams.get('offset') || 0);
    const days = new Date(Number(month.slice(0, 4)), Number(month.slice(-2)), 0).getDate();
    const amounts = { 3: 25000, 7: 18000, 12: 40000, 16: 30000 };
    const populated = month === new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit' }).format(new Date());
    const items = populated ? Object.entries(amounts).map(([day, monto]) => ({ solicitud_id: `demo-${day}`, servicio_nombre: day === '3' ? 'Destape de cañerías' : 'Reparación del hogar', estado: 'COMPLETADA', monto, fecha: `${month}-${day.padStart(2,'0')}T15:00:00Z`, completada: true })) : [];
    if (populated) items.push({ solicitud_id: 'demo-pending', servicio_nombre: 'Instalación de grifería', estado: 'PAGADA', monto: 25000, fecha: `${month}-25T15:00:00Z`, completada: false });
    result = { mes: month, moneda: 'CLP', simulado: true, total_completado: populated ? 113000 : 0, cantidad_completada: populated ? 4 : 0, total_en_curso: populated ? 25000 : 0, cantidad_en_curso: populated ? 1 : 0,
      dias: Array.from({ length: days }, (_, i) => ({ fecha: `${month}-${String(i+1).padStart(2,'0')}`, monto: populated ? amounts[i+1] || 0 : 0 })), items: items.reverse().slice(offset, offset+20), limit: 20, offset, has_more: false };
  }
  else if (path === '/solicitudes') {
    const view = url.searchParams.get('vista'), state = url.searchParams.get('estado');
    const rows = Array.from({ length: listCount }, (_, index) => index === 0 ? booking : { ...booking,
      id: `2847aaaa-aaaa-4aaa-8aaa-${String(index).padStart(12, '0')}`, servicio_nombre: `Servicio de demostración ${index + 1}`,
      estado: ['PENDIENTE', 'ACEPTADA', 'PAGADA', 'COMPLETADA'][index % 4],
    }).filter((item) => {
      const terminal = ['COMPLETADA', 'CANCELADA', 'RECHAZADA'].includes(item.estado);
      return (!state || state === item.estado) && (view !== 'activas' || !terminal) && (view !== 'historial' || terminal);
    });
    const offset = Number(url.searchParams.get('offset') || 0), limit = Number(url.searchParams.get('limit') || 20);
    result = rows.slice(offset, offset + limit);
  }
  else if (path === '/pagos/configuracion') result = { modo: mpPreview ? 'MERCADO_PAGO_TEST' : 'SIMULADO' };
  else if (path.includes('/pago/mercadopago')) {
    if (req.method === 'POST' && !path.endsWith('/sincronizar')) checkout = {
      id: '88888888-8888-4888-8888-888888888888', solicitud_id: booking.id, estado: 'LISTO',
      checkout_url: 'https://www.mercadopago.cl/checkout/v1/redirect?pref_id=fake-preview-only', expira_en: tomorrow.toISOString(),
    };
    result = checkout;
  }
  else if (path === `/solicitudes/${booking.id}`) result = booking;
  else if (path === '/categorias' || path === '/notificaciones') result = [];
  else if (path === '/servicios') {
    const category = { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', nombre: 'Hogar', slug: 'hogar', descripcion: '', requiere_certificacion: false, certificacion_requerida: null, orden: 1 };
    const rows = listCount === 1 ? [] : Array.from({ length: listCount }, (_, index) => ({
      id: `bbbbbbbb-bbbb-4bbb-8bbb-${String(index).padStart(12, '0')}`, nombre: `Servicio de demostración ${index + 1}`,
      descripcion: 'Datos ficticios para revisar listas', precio_base: 25000 + index * 100, duracion_estimada_minutos: 60,
      modalidad: index % 2 ? 'TALLER' : 'DOMICILIO', categoria: category, trabajador: { id: worker, nombre: 'Juan Pérez', comuna: { id: 'demo', nombre: 'Santiago' } },
      creado_en: booking.creado_en, actualizado_en: booking.actualizado_en, ubicacion_publica: 'Santiago', latitud: null, longitud: null, radio_cobertura_km: null,
    })).filter((item) => (!url.searchParams.get('q') || item.nombre.toLowerCase().includes(url.searchParams.get('q').toLowerCase()))
      && (!url.searchParams.get('modalidad') || item.modalidad === url.searchParams.get('modalidad'))
      && (!url.searchParams.get('precio_min') || item.precio_base >= Number(url.searchParams.get('precio_min')))
      && (!url.searchParams.get('precio_max') || item.precio_base <= Number(url.searchParams.get('precio_max'))));
    const offset = Number(url.searchParams.get('offset') || 0), limit = Number(url.searchParams.get('limit') || 5);
    result = { items: rows.slice(offset, offset + limit), total: rows.length, limit, offset };
  }
  else if (path === `/servicios/${booking.servicio_id}`) result = { id: booking.servicio_id, trabajador: { id: worker, nombre: 'Juan Pérez' } };
  else if (path === '/notificaciones/sin-leer') result = { cantidad: 0 };
  else if (path.includes('/chat')) {
    if (['COMPLETADA','CANCELADA','RECHAZADA'].includes(booking.estado)) {
      res.writeHead(410, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ detail: 'Chat cerrado' })); return;
    }
    if (path.endsWith('/chat')) { if (req.method === 'POST') conversation = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'; result = page(url.searchParams); }
    else if (req.method === 'POST') {
      const existing = messages.find((item) => item.id === body.id);
      result = existing || { id: body.id, conversacion_id: conversation, autor_id: workerPreview ? worker : client, contenido: body.contenido, creado_en: new Date().toISOString(), editado_en: null };
      if (!existing) messages.push(result);
    } else {
      const id = path.split('/').at(-1); const item = messages.find((message) => message.id === id);
      if (req.method === 'DELETE') { messages = messages.filter((message) => message.id !== id); result = { ok: true }; }
      else { Object.assign(item, { contenido: body.contenido, editado_en: new Date().toISOString() }); result = item; }
    }
  } else if (path.endsWith('/calificacion')) {
    if (req.method === 'POST') {
      if (booking.estado !== 'COMPLETADA') { status = 409; result = { detail: 'Servicio no completado' }; }
      else {
        if (!review) { status = 201; review = { id: '99999999-9999-4999-8999-999999999999', solicitud_id: booking.id, cliente_id: client, trabajador_id: worker, servicio_id: booking.servicio_id,
          servicio_nombre: booking.servicio_nombre, puntuacion: body.puntuacion, comentario: body.comentario, creado_en: new Date().toISOString() }; }
        result = review;
      }
    } else result = review;
  } else if (path.includes('/calificaciones')) result = { trabajador_id: worker, promedio: review?.puntuacion ?? null, cantidad: review ? 1 : 0, items: review ? [review] : [], limit: 20, offset: 0, has_more: false };
  else if (path.endsWith('/pago')) {
    const amounts = { tarifa_base: 25000, comision: 3750, monto_total: 28750, moneda: 'CLP', simulado: true };
    result = { ...amounts, pago: ['PAGADA','EN_CAMINO','EN_CURSO','LISTO','COMPLETADA'].includes(booking.estado) ? {
      ...amounts, id: '99999999-9999-4999-8999-999999999999', solicitud_id: booking.id, cliente_id: client,
      trabajador_id: worker, estado: 'APROBADO', creado_en: new Date().toISOString(),
      proveedor: mpPreview ? 'MERCADO_PAGO_TEST' : 'SIMULADO', proveedor_pago_id: mpPreview ? '123456' : null,
    } : null };
  }
  else if (path === '/qa/payment') {
    checkout = { id: '88888888-8888-4888-8888-888888888888', solicitud_id: booking.id, estado: body.estado,
      checkout_url: 'https://www.mercadopago.cl/checkout/v1/redirect?pref_id=fake-preview-only', expira_en: tomorrow.toISOString() };
    if (body.estado === 'APROBADO') booking.estado = 'PAGADA';
    result = checkout;
  }
  else if (path === '/qa/state') { booking.estado = body.estado; if (['COMPLETADA','CANCELADA','RECHAZADA'].includes(body.estado)) { conversation = null; messages = []; } result = booking; }
  else { status = 404; result = { detail: 'Not part of isolated preview' }; }
  res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(result));
}).listen(8096, '127.0.0.1', () => process.stdout.write('Isolated tracking preview API: http://127.0.0.1:8096\n'));
