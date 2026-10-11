import { z } from 'zod';

export const recoveryEmailSchema = z.string().trim().email('Ingresa un correo válido.').max(320);
export const passwordResetSchema = z.object({
  email: recoveryEmailSchema,
  code: z.string().trim().regex(/^[0-9]{6,10}$/, 'Ingresa el código numérico que recibiste por correo.'),
  password: z.string().min(8, 'Usa al menos ocho caracteres.').max(128, 'Máximo 128 caracteres.'),
  confirmPassword: z.string().min(1, 'Repite tu contraseña.'),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Las contraseñas no coinciden.', path: ['confirmPassword'],
});
