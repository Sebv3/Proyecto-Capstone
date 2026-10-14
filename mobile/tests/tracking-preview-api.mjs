// Isolated visual QA only. Fake accounts and data; never calls Supabase.
import http from 'node:http';
const client = '55555555-5555-4555-8555-555555555555';
const worker = '11111111-1111-4111-8111-111111111111';
const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(15, 0, 0, 0);
const booking = { id: '2847aaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', servicio_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', cliente_id: client, trabajador_id: worker,
  cliente_nombre: 'Ana González', servicio_nombre: 'Destape de cañerías', precio_base: 25000, duracion_estimada_minutos: 60, modalidad: 'DOMICILIO', inicio_en: tomorrow.toISOString(),
  ubicacion_servicio: 'Dirección de demostración', comuna_servicio_nombre: 'Santiago', estado: 'PENDIENTE', creado_en: new Date().toISOString(), actualizado_en: new Date().toISOString() };
let conversation = null;
let messages = [];
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
  else if (path === '/auth/me') result = { user: { id: client, nombre: 'Ana González', email: 'preview@example.test', telefono: null, rol: 'CLIENTE', activo: true } };
  else if (path === '/solicitudes') result = [booking];
  else if (path === `/solicitudes/${booking.id}`) result = booking;
  else if (path === '/categorias' || path === '/notificaciones') result = [];
  else if (path === '/servicios') result = { items: [], total: 0, limit: 5, offset: 0 };
  else if (path === `/servicios/${booking.servicio_id}`) result = { id: booking.servicio_id, trabajador: { id: worker, nombre: 'Juan Pérez' } };
  else if (path === '/notificaciones/sin-leer') result = { cantidad: 0 };
  else if (path.includes('/chat')) {
    if (['COMPLETADA','CANCELADA','RECHAZADA'].includes(booking.estado)) {
      res.writeHead(410, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ detail: 'Chat cerrado' })); return;
    }
    if (path.endsWith('/chat')) { if (req.method === 'POST') conversation = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'; result = page(url.searchParams); }
    else if (req.method === 'POST') {
      const existing = messages.find((item) => item.id === body.id);
      result = existing || { id: body.id, conversacion_id: conversation, autor_id: client, contenido: body.contenido, creado_en: new Date().toISOString(), editado_en: null };
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
  else if (path.endsWith('/pago')) result = { tarifa_base: 25000, comision: 3750, monto_total: 28750, moneda: 'CLP', simulado: true, pago: null };
  else if (path === '/qa/state') { booking.estado = body.estado; if (['COMPLETADA','CANCELADA','RECHAZADA'].includes(body.estado)) { conversation = null; messages = []; } result = booking; }
  else { status = 404; result = { detail: 'Not part of isolated preview' }; }
  res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(result));
}).listen(8096, '127.0.0.1', () => process.stdout.write('Isolated tracking preview API: http://127.0.0.1:8096\n'));
