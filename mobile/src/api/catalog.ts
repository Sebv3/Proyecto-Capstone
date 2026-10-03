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
};

type CatalogServiceList = {
  items: CatalogService[];
  total: number;
  limit: number;
  offset: number;
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
  requireApi();
  const { data } = await api.get<CatalogServiceList>('/servicios', {
    params: { limit, offset: 0 },
  });
  return data.items;
}

export function catalogErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (!error.response) return 'No pudimos conectar con el catálogo.';
    return 'No pudimos cargar el catálogo. Inténtalo nuevamente.';
  }
  return error instanceof Error ? error.message : 'No pudimos cargar el catálogo.';
}
