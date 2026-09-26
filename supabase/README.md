# Supabase - ServiMatch

Esta carpeta almacenará las migraciones SQL y los datos semilla compartidos por
el equipo. El proyecto remoto de Supabase es el entorno de desarrollo del MVP,
pero su estructura debe poder reconstruirse solamente con los archivos de este
directorio.

## Convenciones

- Cada cambio de esquema se agrega como una nueva migración; no se reescriben
  migraciones que ya hayan sido aplicadas por otros integrantes.
- Las tablas y columnas usan `snake_case`.
- Las claves primarias usan UUID.
- Toda tabla expuesta debe tener Row Level Security habilitado y políticas
  explícitas.
- Los datos iniciales repetibles se guardan en `seed.sql`.
- Nunca se guardan claves o credenciales en esta carpeta.

Las migraciones existentes reconstruyen usuarios, trabajadores, verificación
documental y perfiles cliente. La función `actualizar_perfil_cliente_actual`
guarda los datos personales y de ubicación en una sola transacción. Aplicar una
migración al proyecto remoto compartido requiere revisión del equipo; `seed.sql`
contiene el catálogo inicial de comunas para entornos nuevos.

La migración `20260925220000_lock_worker_verification_submissions.sql` impide
reemplazar documentos mientras una verificación está pendiente o aprobada y
protege los archivos ya referenciados. Aplícala antes de probar la carga de
documentos con trabajadores reales.

La migración `20260925230000_create_worker_profile_during_signup.sql` guarda la
dirección base junto con el registro del trabajador y solo permite editarla
después del primer envío documental. También debe aplicarse al proyecto remoto
antes de probar el nuevo flujo de alta.

La migración `20260925240000_add_worker_commune.sql` incorpora `comuna_id` a
`trabajadores`, valida comunas activas y exige el dato para registros nuevos.
No asigna una comuna arbitraria a los trabajadores existentes. Para revisar
quiénes deben completar el dato:

```sql
select usuario_id, direccion_base
from public.trabajadores
where comuna_id is null;
```

La app los lleva a completar la comuna antes de enviar documentos. Cuando la
consulta anterior no devuelva filas, se puede finalizar la validación con
`alter table public.trabajadores validate constraint trabajadores_comuna_requerida;`.
La restricción `NOT VALID` ya impide nuevos registros o actualizaciones sin
comuna, pero conserva los registros antiguos hasta su corrección.
