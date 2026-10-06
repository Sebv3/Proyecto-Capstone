// Isolated visual smoke test. This never writes sample establishments to Supabase.
import { createServer } from 'node:http';
import { buildMapHtml } from '../src/services/coverageMap.ts';

const points = [
  { id: 'demo-central', nombre: 'Servicio a domicilio de prueba', latitud: -33.4489, longitud: -70.6693, modalidad: 'DOMICILIO', radio_cobertura_km: 1 },
  { id: 'demo-norte', nombre: 'Servicio de taller de prueba', latitud: -33.435, longitud: -70.65, modalidad: 'TALLER' },
];
const map = buildMapHtml(points).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
const picker = buildMapHtml([], { allowPick: true }).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Prueba aislada del mapa</title></head>
<body style="font-family:Arial;margin:16px;background:#f5f7f6"><h1>Mapa de cobertura — prueba aislada</h1>
<p id="status">Cargando mapa…</p><iframe id="map-frame" title="Mapa de locales" sandbox="allow-scripts allow-same-origin"
srcdoc="${map}" style="width:100%;height:65vh;border:0;border-radius:16px"></iframe>
<p id="selection">Toca un marcador. Verde: domicilio. Azul: taller.</p>
<h2>Elegir ubicación al publicar</h2><iframe id="picker-frame" title="Elegir ubicación" sandbox="allow-scripts allow-same-origin"
srcdoc="${picker}" style="width:100%;height:50vh;border:0;border-radius:16px"></iframe><p id="picked">Toca el mapa para elegir.</p><script>
window.addEventListener('message',function(event){
if(event.source===document.getElementById('picker-frame').contentWindow){try{var pick=JSON.parse(event.data);if(pick.type==='pick')document.getElementById('picked').textContent='Punto elegido: '+pick.latitud.toFixed(5)+', '+pick.longitud.toFixed(5);}catch(e){}return;}
if(event.source!==document.getElementById('map-frame').contentWindow)return;
try{var data=JSON.parse(event.data);
if(data.type==='ready')document.getElementById('status').textContent='Mapa cargado';
if(data.type==='error')document.getElementById('status').textContent='Error al cargar mapa';
if(data.type==='select')document.getElementById('selection').textContent='Local seleccionado: '+data.id;
}catch(e){}});</script></body></html>`;
createServer((_request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end(html);
}).listen(8093, '127.0.0.1', () => process.stdout.write('Coverage smoke preview: http://127.0.0.1:8093\n'));
