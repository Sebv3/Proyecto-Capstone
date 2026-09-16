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
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Las contraseñas no coinciden.', path: ['confirmPassword'],
});
export type RegisterValues = z.infer<typeof registerSchema>;
