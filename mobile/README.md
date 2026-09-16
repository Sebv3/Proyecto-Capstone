# ServiMatch móvil — SCRUM-10

Login conectado a `POST /api/v1/auth/login` y `GET /api/v1/auth/me`.
Después de ingresar se muestra el nombre, correo y rol del perfil real.
El acceso se mantiene en memoria: reiniciar la app requiere volver a ingresar.
No se almacenan contraseñas ni tokens en disco. Cerrar sesión elimina el perfil
local; todavía no existe revocación remota de sesiones en el backend.
Desde Login, **Crear cuenta** abre Registro con selección obligatoria de Cliente
o Trabajador, nombre, correo, RUT, contraseña y confirmación. Se valida el dígito
verificador del RUT antes de enviar `POST /api/v1/auth/register`. Al aceptar el
registro se limpian los campos y se indica si hace falta confirmar el correo.
El usuario regresa a Login para ingresar. No se crea automáticamente la ficha
documental del trabajador ni se lo aprueba para publicar servicios.

## Ejecutar

Desde `mobile`, ejecuta `npm ci` y `npm start`, con Docker funcionando.
Configura `EXPO_PUBLIC_API_URL` en `mobile/.env` según el dispositivo:

- Teléfono: `http://IP_LOCAL_DEL_COMPUTADOR:8000/api/v1`, en la misma red Wi-Fi.
- Emulador Android: `http://10.0.2.2:8000/api/v1`.
- Navegador del computador: `http://localhost:8000/api/v1`.

Reinicia Expo después de cambiar la configuración. La clave secreta de Supabase
pertenece exclusivamente al backend; el Login móvil solo utiliza la URL de la API.

## Verificación

```powershell
npm run typecheck
npm run test:auth
npx expo export --platform android
npx expo export --platform ios
```

En el dispositivo, comprobar:

1. Campos vacíos o correo incorrecto: mensajes junto al formulario.
2. Mostrar/ocultar contraseña y acceso al botón con el teclado abierto.
3. Credenciales incorrectas: error y posibilidad de reintentar.
4. Correo pendiente de confirmación: aviso explícito.
5. Usuario confirmado: perfil real después de ingresar.
6. Cerrar sesión: regreso al Login sin acceso al perfil mediante el botón Atrás.
7. API apagada: error de conexión y botón disponible para reintentar.
8. Registro: no permite enviar sin perfil, con RUT incorrecto o contraseñas diferentes.
9. Registrar una cuenta propia nueva, confirmar el correo e ingresar; verificar
   que el perfil muestra el rol seleccionado. Repetir para el otro rol con datos
   de prueba distintos (el RUT y correo son únicos).

Las pruebas HTTP usan respuestas simuladas; el recorrido real debe comprobarse
con una cuenta propia sin compartir contraseñas ni tokens.
