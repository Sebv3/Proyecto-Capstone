import { z } from 'zod';

export function normalizeRut(value: string): string {
  const clean = value.toUpperCase().replace(/[.\s-]/g, '');
  return `${clean.slice(0, -1)}-${clean.slice(-1)}`;
}

function validRut(value: string): boolean {
  if (!/^\d{7,8}-[\dK]$/.test(value)) return false;
  const [body, check] = value.split('-');
  const sum = [...body].reverse().reduce((total, digit, i) => total + Number(digit) * (2 + i % 6), 0);
  const result = 11 - sum % 11;
  return check === (result === 11 ? '0' : result === 10 ? 'K' : String(result));
}

export const registerSchema = z.object({
  nombre: z.string().trim().min(2, 'Ingresa al menos dos caracteres.').max(120, 'Máximo 120 caracteres.'),
  email: z.string().trim().email('Ingresa un correo válido.').max(320),
  rut: z.string().transform(normalizeRut).refine(validRut, 'Revisa el RUT y su dígito verificador.'),
  password: z.string().min(8, 'Usa al menos ocho caracteres.'),
  confirmPassword: z.string().min(1, 'Repite tu contraseña.'),
  rol: z.enum(['CLIENTE', 'TRABAJADOR'], { error: 'Selecciona Cliente o Trabajador.' }),
  direccion: z.string().trim(),
  comuna_id: z.string(),
}).superRefine((data, context) => {
  if (data.password !== data.confirmPassword) {
    context.addIssue({
      code: 'custom', message: 'Las contraseñas no coinciden.', path: ['confirmPassword'],
    });
  }
  if (data.rol === 'CLIENTE' || data.rol === 'TRABAJADOR') {
    if (data.direccion.length < 5) {
      context.addIssue({
        code: 'custom', message: 'Ingresa una dirección de al menos cinco caracteres.',
        path: ['direccion'],
      });
    }
    if (data.direccion.length > 200) {
      context.addIssue({
        code: 'custom', message: 'La dirección no puede superar 200 caracteres.',
        path: ['direccion'],
      });
    }
  }
  if (data.rol === 'CLIENTE' || data.rol === 'TRABAJADOR') {
    if (!z.uuid().safeParse(data.comuna_id).success) {
      context.addIssue({
        code: 'custom', message: 'Selecciona una comuna.', path: ['comuna_id'],
      });
    }
  }
});
export type RegisterValues = z.infer<typeof registerSchema>;
