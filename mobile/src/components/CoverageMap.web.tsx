import { useEffect, useMemo, useRef } from 'react';
import { buildMapHtml, parseMapEvent, type MapEvent, type MapPoint, type MapOptions } from '../services/coverageMap';

type CoverageMapProps = { points: MapPoint[]; onEvent: (event: MapEvent) => void; options?: MapOptions };

export function CoverageMap({ points, onEvent, options }: CoverageMapProps) {
  const frame = useRef<HTMLIFrameElement>(null);
  const html = useMemo(() => buildMapHtml(points, options), [points, options]);
  useEffect(() => {
    function receive(event: MessageEvent) {
      if (event.source !== frame.current?.contentWindow || typeof event.data !== 'string') return;
      const message = parseMapEvent(event.data, points, options?.allowPick);
      if (message) onEvent(message);
    }
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [points, onEvent, options]);
  // Retain the real page origin so tile requests include the Referer required by OSM.
  // Only our escaped HTML and the pinned, integrity-checked Leaflet script run here.
  return <iframe ref={frame} title={options?.allowPick ? 'Elegir ubicación' : 'Mapa de servicios'} srcDoc={html} sandbox="allow-scripts allow-same-origin"
    referrerPolicy="strict-origin-when-cross-origin"
    style={{ border: 0, width: '100%', height: '100%', flex: 1 }} />;
}
