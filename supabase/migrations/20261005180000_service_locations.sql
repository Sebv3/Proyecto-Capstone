-- Existing offers retain null locations until their owners explicitly provide public data.
alter table public.servicios
    add column ubicacion_publica text,
    add column latitud numeric(9,6),
    add column longitud numeric(9,6),
    add column radio_cobertura_km integer,
    add constraint servicios_ubicacion_completa check (
        (ubicacion_publica is null and latitud is null and longitud is null and radio_cobertura_km is null)
        or (ubicacion_publica is not null and char_length(trim(ubicacion_publica)) between 5 and 240
            and latitud is not null and latitud between -90 and 90
            and longitud is not null and longitud between -180 and 180
            and ((modalidad='TALLER' and radio_cobertura_km is null)
                or (modalidad='DOMICILIO' and radio_cobertura_km is not null and radio_cobertura_km between 1 and 100)))
    );
grant update (ubicacion_publica,latitud,longitud,radio_cobertura_km) on public.servicios to authenticated;

create function public.validar_ubicacion_servicio() returns trigger
language plpgsql set search_path = '' as $$
begin
    if new.ubicacion_publica is null or new.latitud is null or new.longitud is null then
        raise exception 'Indica la ubicacion publica del servicio' using errcode='23514';
    end if;
    return new;
end;
$$;
revoke all on function public.validar_ubicacion_servicio() from public;
create trigger servicios_validar_ubicacion before insert or update of
    ubicacion_publica,latitud,longitud,radio_cobertura_km,modalidad on public.servicios
    for each row execute function public.validar_ubicacion_servicio();

-- A return type change requires recreating this public RPC, preserving its signature.
drop function public.buscar_servicios_catalogo(uuid,text,uuid,public.modalidad_servicio,bigint,bigint,integer,integer);
create function public.buscar_servicios_catalogo(
    p_servicio_id uuid default null, p_q text default null, p_categoria_id uuid default null,
    p_modalidad public.modalidad_servicio default null, p_precio_min bigint default null,
    p_precio_max bigint default null, p_limit integer default 20, p_offset integer default 0
)
returns table (
    id uuid, nombre text, descripcion text, precio_base bigint, duracion_estimada_minutos integer,
    modalidad public.modalidad_servicio, categoria_id uuid, categoria_slug text, categoria_nombre text,
    categoria_descripcion text, categoria_requiere_certificacion boolean,
    categoria_certificacion_requerida text, categoria_orden smallint, trabajador_id uuid,
    trabajador_nombre text, comuna_id uuid, comuna_nombre text, creado_en timestamptz,
    actualizado_en timestamptz, ubicacion_publica text, latitud numeric, longitud numeric,
    radio_cobertura_km integer, total_count bigint
)
language sql stable security definer set search_path = '' as $$
    select s.id, s.nombre, s.descripcion, s.precio_base, s.duracion_estimada_minutos, s.modalidad,
        c.id, c.slug, c.nombre, c.descripcion, c.requiere_certificacion, c.certificacion_requerida,
        c.orden, t.usuario_id, u.nombre, co.id, co.nombre, s.creado_en, s.actualizado_en,
        s.ubicacion_publica, s.latitud, s.longitud, s.radio_cobertura_km, count(*) over ()
    from public.servicios s join public.categorias c on c.id = s.categoria_id
    join public.trabajadores t on t.usuario_id = s.trabajador_id
    join public.usuarios u on u.id = t.usuario_id
    join public.verificaciones_trabajador v on v.trabajador_id = t.usuario_id
    left join public.comunas co on co.id = t.comuna_id
    where s.activo and c.activa and u.activo and u.rol = 'TRABAJADOR' and v.estado = 'APROBADA'
        and public.trabajador_certificado_para_categoria(s.trabajador_id, s.categoria_id)
        and (p_servicio_id is null or s.id = p_servicio_id)
        and (nullif(trim(p_q), '') is null or s.nombre ilike '%' || trim(p_q) || '%'
            or s.descripcion ilike '%' || trim(p_q) || '%')
        and (p_categoria_id is null or s.categoria_id = p_categoria_id)
        and (p_modalidad is null or s.modalidad = p_modalidad)
        and (p_precio_min is null or s.precio_base >= p_precio_min)
        and (p_precio_max is null or s.precio_base <= p_precio_max)
    order by s.creado_en desc, s.id limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
$$;
revoke all on function public.buscar_servicios_catalogo(uuid,text,uuid,public.modalidad_servicio,bigint,bigint,integer,integer) from public;
grant execute on function public.buscar_servicios_catalogo(uuid,text,uuid,public.modalidad_servicio,bigint,bigint,integer,integer) to anon,authenticated;

-- Reuse the catalogue projection and eligibility rules for each located offer.
create function public.consultar_servicios_mapa() returns setof jsonb
language sql stable security definer set search_path = '' as $$
    select to_jsonb(c) from public.servicios s
    cross join lateral public.buscar_servicios_catalogo(p_servicio_id=>s.id,p_limit=>1) c
    where s.activo and s.latitud is not null and s.longitud is not null
    order by s.creado_en desc, s.id;
$$;
revoke all on function public.consultar_servicios_mapa() from public;
grant execute on function public.consultar_servicios_mapa() to anon,authenticated;
