-- The API permits a new submission only after rejection. Enforce the same
-- rule in RLS so a worker cannot bypass it through direct Supabase requests.

drop policy if exists verificaciones_corregir_propias
on public.verificaciones_trabajador;

create policy verificaciones_corregir_propias
on public.verificaciones_trabajador
for update to authenticated
using (
    trabajador_id = (select auth.uid())
    and estado = 'RECHAZADA'
    and (select public.es_trabajador())
)
with check (
    trabajador_id = (select auth.uid())
    and (select public.es_trabajador())
);

drop policy if exists documentos_verificacion_subir on storage.objects;

create policy documentos_verificacion_subir
on storage.objects
for insert to authenticated
with check (
    bucket_id = 'documentos-verificacion'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.es_trabajador())
    and not exists (
        select 1
        from public.verificaciones_trabajador as v
        where v.trabajador_id = (select auth.uid())
          and v.estado in ('PENDIENTE', 'APROBADA')
    )
);

-- The application uses unique paths, never overwrites existing documents.
drop policy if exists documentos_verificacion_actualizar on storage.objects;

drop policy if exists documentos_verificacion_eliminar on storage.objects;

-- Allow cleanup of interrupted uploads, but never deletion of documents
-- referenced by a submitted verification (including a rejected one).
create policy documentos_verificacion_eliminar
on storage.objects
for delete to authenticated
using (
    bucket_id = 'documentos-verificacion'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.es_trabajador())
    and not exists (
        select 1
        from public.verificaciones_trabajador as v
        where v.trabajador_id = (select auth.uid())
          and name in (
              v.carnet_frontal_path,
              v.carnet_reverso_path,
              v.selfie_path
          )
    )
);
