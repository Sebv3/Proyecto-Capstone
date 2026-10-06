-- Keep direct PostgREST reads consistent with the public catalog RPC.
-- Own-service and administrator policies remain available for management.
begin;

grant execute on function public.trabajador_puede_publicar(uuid) to anon;

alter policy servicios_catalogo_publico on public.servicios
using (
    activo
    and public.trabajador_puede_publicar(trabajador_id)
    and public.trabajador_certificado_para_categoria(trabajador_id, categoria_id)
    and exists (
        select 1 from public.categorias as categoria
        where categoria.id = servicios.categoria_id
          and categoria.activa
    )
);

commit;
