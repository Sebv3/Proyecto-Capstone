-- Client name and explicitly selected service-address commune snapshots.
begin;
alter table public.solicitudes
    add column cliente_nombre text,
    add column comuna_servicio_id uuid references public.comunas(id) on delete restrict,
    add column comuna_servicio_nombre text;
-- Existing names can be recovered; free-form addresses cannot determine a commune reliably.
update public.solicitudes s set cliente_nombre=u.nombre from public.usuarios u where u.id=s.cliente_id;
alter table public.solicitudes alter column cliente_nombre set not null;
alter table public.solicitudes add constraint solicitudes_comuna_coherente check (
    (comuna_servicio_id is null and comuna_servicio_nombre is null)
    or (comuna_servicio_id is not null and comuna_servicio_nombre is not null)
);
drop function public.crear_solicitud(uuid,timestamptz,text);
create function public.crear_solicitud(
    p_servicio_id uuid, p_inicio_en timestamptz, p_comuna_servicio_id uuid, p_direccion_servicio text default null
) returns setof public.solicitudes
language plpgsql security definer set search_path = '' as $$
declare offer public.servicios; finish timestamptz; address text; client_name text; commune_name text;
begin
    if not exists(select 1 from public.usuarios where id=auth.uid() and rol='CLIENTE' and activo) then
        raise exception 'Se requiere un cliente activo' using errcode='42501';
    end if;
    select nombre into client_name from public.usuarios where id=auth.uid();
    select nombre into commune_name from public.comunas where id=p_comuna_servicio_id and activa;
    if commune_name is null then
        raise exception 'Selecciona la comuna de la direccion del servicio' using errcode='22023';
    end if;
    select * into offer from public.servicios where id=p_servicio_id for share;
    if not found or not exists(select 1 from public.buscar_servicios_catalogo(p_servicio_id=>p_servicio_id)) then
        raise exception 'Servicio no disponible' using errcode='P0002';
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
        offer.duracion_estimada_minutos,offer.modalidad,p_inicio_en,finish,address,client_name,p_comuna_servicio_id,commune_name) returning *;
end; $$;

revoke all on function public.crear_solicitud(uuid,timestamptz,uuid,text) from public;
grant execute on function public.crear_solicitud(uuid,timestamptz,uuid,text) to authenticated;
notify pgrst, 'reload schema';
commit;

