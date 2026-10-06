import { z } from 'zod';

function positiveInteger(label: string, maximum: number) {
  return z.string().trim().regex(/^\d+$/, `${label}: ingresa un número entero positivo.`)
    .transform(Number)
    .refine((value) => Number.isSafeInteger(value) && value > 0 && value <= maximum,
      `${label}: ingresa un valor entre 1 y ${maximum}.`);
}

export const serviceSchema = z.object({
  categoria_id: z.uuid({ error: 'Selecciona una categoría.' }),
  nombre: z.string().trim().min(3, 'Ingresa al menos tres caracteres.').max(120, 'Máximo 120 caracteres.'),
  descripcion: z.string().trim().min(10, 'Describe el servicio con al menos diez caracteres.')
    .max(1000, 'Máximo 1000 caracteres.'),
  precio_base: positiveInteger('Precio', Number.MAX_SAFE_INTEGER),
  duracion_estimada_minutos: positiveInteger('Duración', 2_147_483_647),
  modalidad: z.enum(['DOMICILIO', 'TALLER'], { error: 'Selecciona una modalidad.' }),
  ubicacion_publica: z.string().trim().min(5, 'Indica una dirección o sector con al menos cinco caracteres.').max(240, 'Máximo 240 caracteres.'),
  latitud: z.number({ error: 'Selecciona la ubicación en el mapa.' }).min(-90).max(90),
  longitud: z.number({ error: 'Selecciona la ubicación en el mapa.' }).min(-180).max(180),
  radio_cobertura_km: z.string().trim(),
}).superRefine((value, context) => {
  if (value.modalidad === 'DOMICILIO' && (!/^\d+$/.test(value.radio_cobertura_km)
    || Number(value.radio_cobertura_km) < 1 || Number(value.radio_cobertura_km) > 100)) {
    context.addIssue({ code: 'custom', path: ['radio_cobertura_km'], message: 'Indica una cobertura entre 1 y 100 km.' });
  }
}).transform((value) => ({ ...value, radio_cobertura_km: value.modalidad === 'DOMICILIO' ? Number(value.radio_cobertura_km) : null }));

export type ServiceFormValues = z.input<typeof serviceSchema>;
export type ServiceCreateValues = z.output<typeof serviceSchema>;
