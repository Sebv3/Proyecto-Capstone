import axios from 'axios';

export type Category = {
  id: string;
  slug: string;
  nombre: string;
  descripcion: string;
  requiere_certificacion: boolean;
  certificacion_requerida: string | null;
  orden: number;
};

export type CatalogService = {
  id: string;
  nombre: string;
  descripcion: string;
  precio_base: number;
  duracion_estimada_minutos: number;
  modalidad: 'DOMICILIO' | 'TALLER';
  categoria: Category;
  trabajador: {
    id: string;
    nombre: string;
    comuna: { id: string; nombre: string } | null;
  };
  creado_en: string;
  actualizado_en: string;
  ubicacion_publica: string | null;
  latitud: number | null;
  longitud: number | null;
  radio_cobertura_km: number | null;
};

export type CatalogServiceList = {
  items: CatalogService[];
  total: number;
  limit: number;
  offset: number;
};

export type CatalogFilters = {
  q?: string;
  categoria_id?: string;
  modalidad?: 'DOMICILIO' | 'TALLER';
  precio_min?: number;
  precio_max?: number;
};

const api = axios.create({
  baseURL: process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, ''),
  timeout: 15000,
});

function requireApi() {
  if (!api.defaults.baseURL) throw new Error('No se ha configurado la conexión con el servicio.');
}

export async function getCategories(): Promise<Category[]> {
  requireApi();
  const { data } = await api.get<Category[]>('/categorias');
  return data;
}

export async function getFeaturedServices(limit = 5): Promise<CatalogService[]> {
  const data = await searchServices({}, limit);
  return data.items;
}

export async function searchServices(
  filters: CatalogFilters, limit = 20, offset = 0, signal?: AbortSignal,
): Promise<CatalogServiceList> {
  requireApi();
  const { data } = await api.get<CatalogServiceList>('/servicios', {
    params: { ...filters, limit, offset }, signal,
  });
  return data;
}

export async function getServiceDetail(serviceId: string, signal?: AbortSignal): Promise<CatalogService> {
  requireApi();
  const { data } = await api.get<CatalogService>(`/servicios/${encodeURIComponent(serviceId)}`, { signal });
  return data;
}

export function catalogErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (!error.response) return 'No pudimos conectar con el catálogo.';
    if (error.response.status === 404) return 'Este servicio ya no está disponible.';
    if (error.response.status === 422) return 'Revisa los filtros de búsqueda e inténtalo nuevamente.';
    return 'No pudimos cargar el catálogo. Inténtalo nuevamente.';
  }
  return error instanceof Error ? error.message : 'No pudimos cargar el catálogo.';
}
