export const CERTIFICATION_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

export function certificationFileError(file: { mimeType?: string; size?: number }): string | null {
  if (!CERTIFICATION_MIME_TYPES.includes(file.mimeType ?? '')) return 'Selecciona un PDF o una imagen JPEG, PNG o WebP.';
  if (file.size !== undefined && (file.size <= 0 || file.size > 5 * 1024 * 1024)) return 'El archivo debe tener contenido y pesar como máximo 5 MB.';
  return null;
}

export function canPublishInCategory(
  category: { id: string; requiere_certificacion: boolean },
  certifications: { categoria_id: string; estado: string }[],
): boolean {
  return !category.requiere_certificacion || certifications.some((item) =>
    item.categoria_id === category.id && item.estado === 'APROBADA');
}
