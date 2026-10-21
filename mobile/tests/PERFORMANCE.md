# SCRUM-65: comprobación de rendimiento

## Resultado comprobado

Vista previa web local de 390 × 844, datos ficticios y API aislada. El conteo es
de elementos montados en el DOM; no equivale a FPS ni a memoria medida en un teléfono.

| Escenario | Datos cargados | Filas montadas observadas |
| --- | ---: | ---: |
| Solicitudes: dos páginas y regreso al inicio | 40 | 13 |
| Chat: páginas anteriores y un envío | 121 | 44 |

Las pantallas anteriores con ScrollView + map montaban todos los registros cargados.
Los conteos de FlatList varían con el desplazamiento, tamaño de letra y plataforma.

Además se comprobó en UI: Activas/Historial, filtro Cancelada con estado vacío,
segunda página de solicitudes, búsqueda de un servicio entre 500, envío y edición
de mensaje, carga de mensajes anteriores, selección de barra y cambio a mes vacío.
Todos los datos utilizados fueron ficticios; no se escribieron registros en Supabase.

Las pruebas unitarias verifican 5.000 mensajes sin cambios conservando la misma
referencia, edición aislada, eliminación autoritativa, cambios de autor/conversación
y deduplicación al unir páginas. No se usan límites de tiempo frágiles como tests.

## Repetir el escenario local

En mobile, primera terminal PowerShell:

```powershell
$env:PREVIEW_ROLE='CLIENTE' # TRABAJADOR para ganancias y agenda
$env:PREVIEW_LIST_COUNT='500'
$env:PREVIEW_CHAT_COUNT='120'
node tests/tracking-preview-api.mjs
```

En otra terminal, también en mobile:

```powershell
$env:EXPO_PUBLIC_API_URL='http://127.0.0.1:8096/api/v1'
npx expo start --web --port 8095
```

Ingresar con preview@example.test y cualquier contraseña de formato válido. La API
solo sirve datos locales ficticios y no accede a Supabase ni a Mercado Pago.
Sin las variables de cantidad mantiene su escenario mínimo original.

## Comprobación en teléfono

Probar en Expo Go desplazamiento rápido, cargar más, volver desde el seguimiento,
escritura con teclado visible, mensajes largos y letra de sistema grande. Confirmar
que mensajes nuevos queden abajo y cargar anteriores no salte al final.
Para comparar FPS y memoria reales, medir el mismo recorrido antes/después en el
mismo dispositivo con un build de release/profiling; los tiempos web de desarrollo
no se presentan como rendimiento nativo certificado.
