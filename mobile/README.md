# ServiMatch móvil — SCRUM-10 a SCRUM-12

Login conectado a `POST /api/v1/auth/login` y `GET /api/v1/auth/me`.
Después de ingresar se muestra el nombre, correo y rol del perfil real.
En Android e iOS, la sesión se almacena cifrada con Expo SecureStore y se restaura
al reiniciar la app. Si el access token venció, el móvil utiliza `/auth/refresh`,
guarda los tokens rotados y vuelve a consultar `/auth/me`. Nunca se guarda la
contraseña. En web, la sesión se conserva solo durante la pestaña actual mediante
`sessionStorage`, porque el navegador no ofrece un equivalente de SecureStore.
Cerrar sesión elimina los tokens y el perfil local; todavía no existe revocación
remota de sesiones en el backend.
Mientras la app permanece abierta, la sesión se renueva antes de vencer. Si una
petición protegida recibe 401, se intenta una renovación y se reintenta una vez.
Mientras se comprueba la sesión guardada, la navegación muestra una pantalla de
carga. Login y Perfil se montan únicamente después de conocer el estado real, por
lo que recargar la app no debe mostrar brevemente el formulario de ingreso.
Desde Login, **Crear cuenta** abre Registro con selección obligatoria de Cliente
o Trabajador, nombre, correo, RUT, contraseña y confirmación. Se valida el dígito
verificador del RUT antes de enviar `POST /api/v1/auth/register`. Al aceptar el
registro se limpian los campos y se indica si hace falta confirmar el correo.
El trabajador indica dirección base y comuna en ese formulario. Si debe confirmar el
correo, ve una vista intermedia y después inicia sesión. Si recibe una sesión
al registrarse, continúa directamente al paso documental. La cuenta y su
ubicación se crean juntas, pero eso no implica aprobación para trabajar.

En **Mi perfil**, el cliente puede editar nombre, teléfono, dirección y comuna
sin salir de la pantalla. El RUT y el correo se muestran como datos no editables.
Si su cuenta es anterior a la creación automática de perfiles, se le pide
completar dirección y comuna allí mismo. La desactivación de cuenta requiere una
confirmación y después cierra la sesión local.

Antes de Home, el trabajador sin documentos o con verificación rechazada ve una
pantalla dedicada para subir frente y reverso del carnet más una selfie. Esa
pantalla no permite editar la dirección ni la comuna. Las imágenes deben ser JPEG, PNG o WebP
de hasta 5 MiB cada una. Una vez enviadas, entra al Home limitado con estado
`PENDIENTE` y puede editar dirección y comuna desde **Mi perfil**. Si vuelve a ser
rechazado, regresa al paso documental con el motivo. Con `APROBADA` entra al
Home aprobado. Todavía no existen las funciones de publicar o aceptar trabajos;
cuando se creen deberán comprobar `APROBADA` también en el backend. La revisión
se realiza manualmente en Supabase; no hay controles de administrador en la app.
Las cuentas antiguas sin comuna vuelven a **Mi perfil** para elegirla antes de
entrar al paso documental; la app no deduce la comuna del texto de la dirección.

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
5. Trabajador confirmado: paso documental antes de Home; cliente: su perfil.
6. Cerrar sesión: regreso al Login sin acceso al perfil mediante el botón Atrás.
7. API apagada: error de conexión y botón disponible para reintentar.
8. Registro: no permite enviar sin perfil, con RUT incorrecto o contraseñas diferentes.
9. Registrar una cuenta propia nueva, confirmar el correo e ingresar; verificar
   que el perfil muestra el rol seleccionado. Repetir para el otro rol con datos
   de prueba distintos (el RUT y correo son únicos).
10. En Android o iOS, cerrar y abrir nuevamente la app: debe recuperar el perfil
    sin solicitar otra vez la contraseña.
11. Cerrar sesión y reiniciar la app: debe permanecer en Login.
12. En web, recargar la pestaña mantiene la sesión; cerrar la pestaña elimina la
    sesión temporal.
13. Al recargar con una sesión guardada, debe aparecer brevemente “Preparando tu
    sesión…” y luego la pantalla correspondiente, sin mostrar Login entre ambas.
14. Trabajador pendiente: Home limitado, edición de dirección desde Mi perfil y
    retorno al paso documental si cambia a `RECHAZADA`.

Las pruebas HTTP usan respuestas simuladas; el recorrido real debe comprobarse
con una cuenta propia sin compartir contraseñas ni tokens.
