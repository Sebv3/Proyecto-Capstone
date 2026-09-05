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

La primera migración se creará al diseñar el esquema de autenticación y perfiles.
