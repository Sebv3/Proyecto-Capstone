# ServiMatch API

La forma recomendada de ejecutar la API es mediante Docker Compose desde la raíz
del repositorio. La documentación interactiva queda disponible en
`http://localhost:8000/docs` y el endpoint de salud en
`http://localhost:8000/api/v1/health`.

## Pruebas

Con el contenedor en ejecución:

```powershell
docker compose exec api pytest
```

## Autenticación (SCRUM-9)

La API delega registro, inicio de sesión y renovación de tokens en Supabase Auth.
Supabase crea automáticamente el perfil en `public.usuarios` durante el registro.
La aplicación móvil utilizará estos endpoints:

| Endpoint | Entrada | Respuesta |
|---|---|---|
| `POST /api/v1/auth/register` | `email`, `password`, `nombre`, `rut`, `rol` (`CLIENTE` o `TRABAJADOR`) | `user_id`, `session` y `email_confirmation_required` |
| `POST /api/v1/auth/login` | `email`, `password` | `access_token`, `refresh_token`, `token_type`, `expires_in` |
| `POST /api/v1/auth/refresh` | `refresh_token` | Una sesión nueva con tokens renovados |
| `GET /api/v1/auth/me` | `Authorization: Bearer <access_token>` | Perfil del usuario autenticado |

`register` envía `nombre`, `rut` y `rol` como metadatos de Supabase Auth porque la
migración los necesita para crear el perfil. Si está activada la confirmación de
correo, la respuesta de registro tendrá `session: null` hasta que el usuario confirme
su dirección. FastAPI valida el token con Supabase antes de consultar el perfil y
utiliza el token del usuario para respetar las políticas RLS de PostgreSQL.

## Comprobar el registro con Supabase real

1. Abre `http://localhost:8000/docs` con la API funcionando.
2. En `POST /api/v1/auth/register`, selecciona **Try it out** e introduce tu
   correo, una contraseña nueva de al menos ocho caracteres, nombre, RUT válido
   y rol `CLIENTE` o `TRABAJADOR`. Escribe la contraseña solo en tu equipo.
   El RUT admite puntos y se normaliza; un dígito verificador incorrecto devuelve 422.
3. Ejecuta la petición. Un 201 indica que Supabase aceptó el registro. Si devuelve
   `email_confirmation_required: true`, abre el enlace del correo de confirmación.
   No desactives esa comprobación para saltarte este paso.
4. En `POST /api/v1/auth/login`, introduce el mismo correo y contraseña.
   Si falta confirmar el correo, la API responde 403 con un mensaje específico.
5. Copia el `access_token` de la respuesta de login. En **Authorize**, pégalo
   en el campo de HTTPBearer (solo el token, sin escribir `Bearer`).
6. Ejecuta `GET /api/v1/auth/me`. Debe responder 200 con tu perfil y rol.
7. Para comprobar la renovación, utiliza el `refresh_token` de login en
   `POST /api/v1/auth/refresh`. Autoriza de nuevo con el nuevo `access_token`
   y repite `/me`. No compartas los tokens ni capturas que los incluyan.

El endpoint `/health` solo comprueba FastAPI. La consulta autenticada `/auth/me`
comprueba además Supabase Auth, el perfil creado por el trigger y su acceso con RLS.
Un registro real puede enviar correo y crear datos; las pruebas de Pytest usan
respuestas simuladas y no registran usuarios en Supabase.
