export type Coordinates = { latitud: number; longitud: number };

export function isValidCoordinates(value: Coordinates): boolean {
  return Number.isFinite(value.latitud) && Math.abs(value.latitud) <= 90
    && Number.isFinite(value.longitud) && Math.abs(value.longitud) <= 180;
}

export function distanceKm(a: Coordinates, b: Coordinates): number {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const dLat = radians(b.latitud - a.latitud);
  const dLon = radians(b.longitud - a.longitud);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.latitud)) * Math.cos(radians(b.latitud)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}

export function coverageLabel(service: Coordinates & { modalidad: string; radio_cobertura_km: number | null }, client: Coordinates): string {
  const km = distanceKm(service, client);
  const distance = `${km.toFixed(1).replace('.', ',')} km en línea recta`;
  if (service.modalidad !== 'DOMICILIO') return `Taller a ${distance}`;
  return `${distance} · ${service.radio_cobertura_km !== null && km <= service.radio_cobertura_km
    ? 'Dentro de la cobertura declarada' : 'Fuera de la cobertura declarada'}`;
}
