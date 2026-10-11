-- The worker owns the workshop location; bookings snapshot the service commune.
begin;
alter table public.servicios add column comuna_taller_id uuid references public.comunas(id) on delete restrict;
grant update(comuna_taller_id) on public.servicios to authenticated;
create function public.validar_comuna_taller() returns trigger
language plpgsql set search_path='' as $$ begin
    if new.modalidad='TALLER' then
        if new.comuna_taller_id is null or not exists(select 1 from public.comunas where id=new.comuna_taller_id and activa) then
            raise exception 'Selecciona la comuna activa del taller' using errcode='23514';
        end if;
    elsif new.comuna_taller_id is not null then
        raise exception 'La comuna del taller corresponde solo a TALLER' using errcode='23514';
    end if;
    return new;
end; $$;
revoke all on function public.validar_comuna_taller() from public;
create trigger servicios_validar_comuna_taller before insert or update of modalidad,ubicacion_publica,comuna_taller_id
on public.servicios for each row execute function public.validar_comuna_taller();
-- Legacy workshops remain unset until their owners edit them; never infer from a profile.
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
    radio_cobertura_km integer, comuna_taller_id uuid, comuna_taller_nombre text, total_count bigint
)
language sql stable security definer set search_path = '' as $$
    select s.id, s.nombre, s.descripcion, s.precio_base, s.duracion_estimada_minutos, s.modalidad,
        c.id, c.slug, c.nombre, c.descripcion, c.requiere_certificacion, c.certificacion_requerida,
        c.orden, t.usuario_id, u.nombre, co.id, co.nombre, s.creado_en, s.actualizado_en,
        s.ubicacion_publica, s.latitud, s.longitud, s.radio_cobertura_km, taller_co.id, taller_co.nombre, count(*) over ()
    from public.servicios s join public.categorias c on c.id = s.categoria_id
    join public.trabajadores t on t.usuario_id = s.trabajador_id
    join public.usuarios u on u.id = t.usuario_id
    join public.verificaciones_trabajador v on v.trabajador_id = t.usuario_id
    left join public.comunas co on co.id = t.comuna_id
    left join public.comunas taller_co on taller_co.id = s.comuna_taller_id
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

create or replace function public.crear_solicitud(
    p_servicio_id uuid, p_inicio_en timestamptz, p_comuna_servicio_id uuid default null, p_direccion_servicio text default null
) returns setof public.solicitudes
language plpgsql security definer set search_path = '' as $$
declare offer public.servicios; finish timestamptz; address text; client_name text; commune_name text;
begin
    if not exists(select 1 from public.usuarios where id=auth.uid() and rol='CLIENTE' and activo) then
        raise exception 'Se requiere un cliente activo' using errcode='42501';
    end if;
    select nombre into client_name from public.usuarios where id=auth.uid();
    select * into offer from public.servicios where id=p_servicio_id for share;
    if not found or not exists(select 1 from public.buscar_servicios_catalogo(p_servicio_id=>p_servicio_id)) then
        raise exception 'Servicio no disponible' using errcode='P0002';
    end if;
    if offer.modalidad='TALLER' then
        if offer.comuna_taller_id is null or (p_comuna_servicio_id is not null and p_comuna_servicio_id <> offer.comuna_taller_id) then
            raise exception 'La comuna del taller la define el trabajador' using errcode='22023';
        end if;
        select nombre into commune_name from public.comunas where id=offer.comuna_taller_id and activa;
    else
        select nombre into commune_name from public.comunas where id=p_comuna_servicio_id and activa;
    end if;
    if commune_name is null then
        raise exception 'Falta una comuna activa para la direccion del servicio' using errcode='22023';
    end if;
    if p_inicio_en is null or p_inicio_en <= now() then
        raise exception 'La fecha y hora deben ser futuras' using errcode='22023';
    end if;
    finish := p_inicio_en + offer.duracion_estimada_minutos * interval '1 minute';
    address := case when offer.modalidad='DOMICILIO' then nullif(trim(p_direccion_servicio),'')
        else offer.ubicacion_publica end;
    if address is null or char_length(address) not between 5 and 240
        or (offer.modalidad='TALLER' and p_direccion_servicio is not null) then
        raise exception 'Revisa la direccion segun la modalidad' using errcode='22023';
    end if;
    perform pg_advisory_xact_lock(hashtextextended(offer.trabajador_id::text, 1));
    if not exists(select 1 from public.disponibilidades where servicio_id=p_servicio_id
        and inicio_en <= p_inicio_en and fin_en >= finish) then
        raise exception 'El horario no esta disponible' using errcode='PT409';
    end if;
    if exists(select 1 from public.solicitudes where trabajador_id=offer.trabajador_id
        and estado in ('ACEPTADA','PAGADA','EN_CAMINO','EN_CURSO','LISTO')
        and tstzrange(inicio_en,fin_en,'[)') && tstzrange(p_inicio_en,finish,'[)'))
        or exists(select 1 from public.solicitudes where cliente_id=auth.uid()
        and servicio_id=p_servicio_id and inicio_en=p_inicio_en and estado='PENDIENTE') then
        raise exception 'Conflicto de horario o solicitud duplicada' using errcode='PT409';
    end if;
    return query insert into public.solicitudes(servicio_id,cliente_id,trabajador_id,
        servicio_nombre,precio_base,duracion_estimada_minutos,modalidad,inicio_en,fin_en,ubicacion_servicio,cliente_nombre,comuna_servicio_id,comuna_servicio_nombre)
    values(offer.id,auth.uid(),offer.trabajador_id,offer.nombre,offer.precio_base,
        offer.duracion_estimada_minutos,offer.modalidad,p_inicio_en,finish,address,client_name,case when offer.modalidad='TALLER' then offer.comuna_taller_id else p_comuna_servicio_id end,commune_name) returning *;
end; $$;


notify pgrst, 'reload schema';
commit;
