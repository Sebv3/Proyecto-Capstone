-- Public catalog projection. It exposes only fields required by the client app.

create or replace function public.buscar_servicios_catalogo(
    p_servicio_id uuid default null,
    p_q text default null,
    p_categoria_id uuid default null,
    p_modalidad public.modalidad_servicio default null,
    p_precio_min bigint default null,
    p_precio_max bigint default null,
    p_limit integer default 20,
    p_offset integer default 0
)
returns table (
    id uuid,
    nombre text,
    descripcion text,
    precio_base bigint,
    duracion_estimada_minutos integer,
    modalidad public.modalidad_servicio,
    categoria_id uuid,
    categoria_slug text,
    categoria_nombre text,
    categoria_descripcion text,
    categoria_requiere_certificacion boolean,
    categoria_certificacion_requerida text,
    categoria_orden smallint,
    trabajador_id uuid,
    trabajador_nombre text,
    comuna_id uuid,
    comuna_nombre text,
    creado_en timestamptz,
    actualizado_en timestamptz,
    total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
    select
        servicio.id,
        servicio.nombre,
        servicio.descripcion,
        servicio.precio_base,
        servicio.duracion_estimada_minutos,
        servicio.modalidad,
        categoria.id,
        categoria.slug,
        categoria.nombre,
        categoria.descripcion,
        categoria.requiere_certificacion,
        categoria.certificacion_requerida,
        categoria.orden,
        trabajador.usuario_id,
        usuario.nombre,
        comuna.id,
        comuna.nombre,
        servicio.creado_en,
        servicio.actualizado_en,
        count(*) over ()
    from public.servicios as servicio
    join public.categorias as categoria
      on categoria.id = servicio.categoria_id
    join public.trabajadores as trabajador
      on trabajador.usuario_id = servicio.trabajador_id
    join public.usuarios as usuario
      on usuario.id = trabajador.usuario_id
    join public.verificaciones_trabajador as verificacion
      on verificacion.trabajador_id = trabajador.usuario_id
    left join public.comunas as comuna
      on comuna.id = trabajador.comuna_id
    where servicio.activo
      and categoria.activa
      and usuario.activo
      and usuario.rol = 'TRABAJADOR'
      and verificacion.estado = 'APROBADA'
      and (p_servicio_id is null or servicio.id = p_servicio_id)
      and (
          nullif(trim(p_q), '') is null
          or servicio.nombre ilike '%' || trim(p_q) || '%'
          or servicio.descripcion ilike '%' || trim(p_q) || '%'
      )
      and (p_categoria_id is null or servicio.categoria_id = p_categoria_id)
      and (p_modalidad is null or servicio.modalidad = p_modalidad)
      and (p_precio_min is null or servicio.precio_base >= p_precio_min)
      and (p_precio_max is null or servicio.precio_base <= p_precio_max)
    order by servicio.creado_en desc, servicio.id
    limit least(greatest(p_limit, 1), 100)
    offset greatest(p_offset, 0);
$$;

revoke all on function public.buscar_servicios_catalogo(
    uuid, text, uuid, public.modalidad_servicio, bigint, bigint, integer, integer
) from public;

grant execute on function public.buscar_servicios_catalogo(
    uuid, text, uuid, public.modalidad_servicio, bigint, bigint, integer, integer
) to anon, authenticated;

comment on function public.buscar_servicios_catalogo(
    uuid, text, uuid, public.modalidad_servicio, bigint, bigint, integer, integer
) is 'Safe public catalog with active services and approved worker display data.';
