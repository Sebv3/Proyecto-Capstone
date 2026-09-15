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
