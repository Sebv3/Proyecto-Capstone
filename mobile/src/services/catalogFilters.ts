import { z } from 'zod';

const price = z.string().trim().refine((value) => value === '' || /^\d+$/.test(value)
  && Number.isSafeInteger(Number(value)) && Number(value) > 0,
  'Ingresa un precio entero mayor que cero, sin puntos ni decimales.')
  .transform((value) => value === '' ? undefined : Number(value));

export const catalogFiltersSchema = z.object({
  q: z.string().trim().max(100, 'Usa hasta 100 caracteres.')
    .refine((value) => value.length === 0 || value.length >= 2, 'Escribe al menos dos caracteres.')
    .transform((value) => value || undefined),
  categoria_id: z.union([z.literal(''), z.uuid()]).transform((value) => value || undefined),
  modalidad: z.enum(['', 'DOMICILIO', 'TALLER']).transform((value) => value || undefined),
  precio_min: price,
  precio_max: price,
}).refine((value) => value.precio_min === undefined || value.precio_max === undefined
  || value.precio_min <= value.precio_max, {
  message: 'El precio mínimo no puede superar al máximo.', path: ['precio_max'],
});
export type CatalogFilterForm = z.input<typeof catalogFiltersSchema>;

export function formatCatalogPrice(price: number): string {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(price);
}
