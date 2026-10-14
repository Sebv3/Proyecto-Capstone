import axios from 'axios';
export type PublicReview = { id: string; puntuacion: number; comentario: string | null; servicio_nombre: string; creado_en: string };
export type Review = PublicReview & { solicitud_id: string; cliente_id: string; trabajador_id: string; servicio_id: string };
export type WorkerReviews = { trabajador_id: string; promedio: number | null; cantidad: number; items: PublicReview[]; limit: number; offset: number; has_more: boolean };
const api = axios.create({ baseURL: process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, ''), timeout: 15000 });
function connection() { if (!api.defaults.baseURL) throw new Error('No se ha configurado la conexión.'); }
export async function getBookingReview(token: string, id: string, signal?: AbortSignal): Promise<Review | null> {
  connection(); const { data } = await api.get<Review | null>(`/solicitudes/${encodeURIComponent(id)}/calificacion`, { headers: { Authorization: `Bearer ${token}` }, signal }); return data;
}
export async function createReview(token: string, id: string, rating: number, comment: string): Promise<Review> {
  connection();
  if (!Number.isInteger(rating) || rating < 1 || rating > 5 || comment.trim().length > 1000) throw new Error('Selecciona de 1 a 5 estrellas y un comentario de hasta 1000 caracteres.');
  const { data } = await api.post<Review>(`/solicitudes/${encodeURIComponent(id)}/calificacion`, { puntuacion: rating, comentario: comment.trim() || null }, { headers: { Authorization: `Bearer ${token}` } }); return data;
}
export async function getWorkerReviews(id: string, offset = 0, signal?: AbortSignal): Promise<WorkerReviews> {
  connection(); const { data } = await api.get<WorkerReviews>(`/trabajadores/${encodeURIComponent(id)}/calificaciones`, { params: { limit: 20, offset }, signal }); return data;
}
export function reviewError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (!error.response) return 'No recibimos confirmación. Actualiza la calificación antes de reintentar.';
    switch (error.response.status) {
      case 401: return 'Tu sesión venció. Inicia sesión nuevamente.';
      case 403: return 'Solo el cliente que contrató este servicio puede calificarlo.';
      case 404: return 'La solicitud o el trabajador no están disponibles.';
      case 409: return 'Solo puedes calificar una vez un servicio completado. Actualiza la calificación.';
      case 422: return 'Selecciona de 1 a 5 estrellas y un comentario de hasta 1000 caracteres.';
      case 503: return 'Las calificaciones no están disponibles en este momento.';
    }
  }
  return 'No pudimos consultar o guardar la calificación. Inténtalo nuevamente.';
}
