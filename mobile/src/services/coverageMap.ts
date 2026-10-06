export type MapPoint = { id: string; nombre: string; latitud: number; longitud: number; modalidad?: string; radio_cobertura_km?: number | null };
export type MapOptions = { allowPick?: boolean; center?: { latitud: number; longitud: number } };
export type MapEvent = { type: 'ready' | 'error' | 'copyright' } | { type: 'select'; id: string }
  | { type: 'pick'; latitud: number; longitud: number };

export function parseMapEvent(raw: string, points: MapPoint[], allowPick = false): MapEvent | null {
  if (raw.length > 1000) return null;
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== 'object') return null;
    if (allowPick && value.type === 'pick' && typeof value.latitud === 'number' && typeof value.longitud === 'number'
      && Number.isFinite(value.latitud) && Math.abs(value.latitud) <= 90
      && Number.isFinite(value.longitud) && Math.abs(value.longitud) <= 180) {
      return { type: 'pick', latitud: value.latitud, longitud: value.longitud };
    }
    if (value.type === 'select' && typeof value.id === 'string' && points.some((p) => p.id === value.id)) {
      return { type: 'select', id: value.id };
    }
    if (['ready', 'error', 'copyright'].includes(value.type)) return { type: value.type };
  } catch { /* Ignore messages that do not belong to the map bridge. */ }
  return null;
}

export function buildMapHtml(points: MapPoint[], options: MapOptions = {}): string {
  const safePoints = points.filter((p) => Number.isFinite(p.latitud) && Number.isFinite(p.longitud)
    && Math.abs(p.latitud) <= 90 && Math.abs(p.longitud) <= 180);
  // JSON embedded in a script must not be able to terminate its HTML element.
  const data = JSON.stringify(safePoints).replace(/[<>&\u2028\u2029]/g,
    (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`);
  return `<!DOCTYPE html><html lang="es"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="strict-origin-when-cross-origin">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-servimatch-map' https://unpkg.com; style-src 'unsafe-inline' https://unpkg.com; img-src https://tile.openstreetmap.org data:; connect-src 'none'; base-uri 'none'; form-action 'none';">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="anonymous">
<style>html,body,#map{height:100%;width:100%;margin:0;background:#e8eeeb}body{font-family:Arial,sans-serif}.leaflet-tooltip{font-size:13px}.leaflet-control-attribution{font-size:10px}</style>
</head><body><div id="map" role="region" aria-label="${options.allowPick ? 'Elegir ubicación en el mapa' : 'Mapa de servicios'}"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin="anonymous"></script>
<script nonce="servimatch-map">
(function(){
function send(message){var value=JSON.stringify(message);if(window.ReactNativeWebView){window.ReactNativeWebView.postMessage(value);}else{window.parent.postMessage(value,'*');}}
document.addEventListener('click',function(e){var a=e.target.closest('a');if(a){e.preventDefault();if(a.href==='https://www.openstreetmap.org/copyright'){send({type:'copyright'});}}});
try{
if(!window.L){send({type:'error'});return;}
var points=${data};
var allowPick=${options.allowPick === true};
var map=L.map('map',{attributionControl:true,maxZoom:19});
map.attributionControl.setPrefix(false);
var tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,updateWhenIdle:true,keepBuffer:1,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'});
var loaded=false;
tiles.on('tileload',function(){if(!loaded){loaded=true;send({type:'ready'});}});
tiles.on('load',function(){if(!loaded){send({type:'error'});}});
tiles.addTo(map);
var bounds=[];
points.forEach(function(p){var position=[p.latitud,p.longitud];bounds.push(position);
var label=document.createElement('span');label.textContent=p.nombre;
if(p.modalidad==='DOMICILIO' && p.radio_cobertura_km>=1 && p.radio_cobertura_km<=100){L.circle(position,{radius:p.radio_cobertura_km*1000,color:'#00875A',weight:1,fillOpacity:0.04,interactive:false}).addTo(map);}
L.circleMarker(position,{radius:10,color:'#fff',weight:3,fillColor:p.modalidad==='TALLER'?'#2563EB':'#00875A',fillOpacity:1})
.addTo(map).bindTooltip(label).on('click',function(){send({type:'select',id:p.id});});});
if(bounds.length){map.fitBounds(bounds,{padding:[32,32],maxZoom:15});}else{map.setView([${Number.isFinite(options.center?.latitud) ? options.center!.latitud : -33.4489},${Number.isFinite(options.center?.longitud) ? options.center!.longitud : -70.6693}],11);}
if(allowPick){var picked=null;map.on('click',function(e){var pos=e.latlng;if(picked){picked.setLatLng(pos);}else{picked=L.circleMarker(pos,{radius:10,color:'#fff',weight:3,fillColor:'#D97706',fillOpacity:1}).addTo(map);}send({type:'pick',latitud:pos.lat,longitud:pos.lng});});}
setTimeout(function(){map.invalidateSize();},100);
}catch(e){send({type:'error'});}
})();
</script></body></html>`;
}
