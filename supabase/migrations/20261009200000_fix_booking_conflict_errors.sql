-- Business conflicts must return HTTP 409, not trigger serialization retries.
-- Preserve the applied migration, authorization, locks and existing grants/data.
begin;

create or replace function public.gestionar_disponibilidad(
    p_servicio_id uuid, p_inicio_en timestamptz default null,
    p_fin_en timestamptz default null, p_bloque_id uuid default null
) returns setof public.disponibilidades
language plpgsql security definer set search_path = '' as $$
declare owner_id uuid;
begin
    select trabajador_id into owner_id from public.servicios where id=p_servicio_id;
    if owner_id is null or owner_id <> auth.uid() or not public.es_trabajador() then
        raise exception 'Operacion no permitida' using errcode='42501';
    end if;
    perform pg_advisory_xact_lock(hashtextextended(owner_id::text, 1));
    if p_bloque_id is not null then
        if exists(select 1 from public.disponibilidades d join public.solicitudes s
            on s.trabajador_id=owner_id and s.estado in ('ACEPTADA','PAGADA','EN_CAMINO','EN_CURSO','LISTO')
            and tstzrange(s.inicio_en,s.fin_en,'[)') && tstzrange(d.inicio_en,d.fin_en,'[)')
            where d.id=p_bloque_id and d.servicio_id=p_servicio_id) then
            raise exception 'El bloque tiene solicitudes confirmadas' using errcode='PT409';
        end if;
        return query delete from public.disponibilidades
            where id=p_bloque_id and servicio_id=p_servicio_id returning *;
        if not found then raise exception 'Bloque no encontrado' using errcode='P0002'; end if;
    else
        if p_inicio_en is null or p_fin_en is null or p_inicio_en <= now() or p_fin_en <= p_inicio_en then
            raise exception 'Bloque de disponibilidad invalido' using errcode='22023';
        end if;
        return query insert into public.disponibilidades(servicio_id,inicio_en,fin_en)
            values(p_servicio_id,p_inicio_en,p_fin_en) returning *;
    end if;
end; $$;

create or replace function public.crear_solicitud(
    p_servicio_id uuid, p_inicio_en timestamptz, p_direccion_servicio text default null
) returns setof public.solicitudes
language plpgsql security definer set search_path = '' as $$
declare offer public.servicios; finish timestamptz; address text;
begin
    if not exists(select 1 from public.usuarios where id=auth.uid() and rol='CLIENTE' and activo) then
        raise exception 'Se requiere un cliente activo' using errcode='42501';
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
        servicio_nombre,precio_base,duracion_estimada_minutos,modalidad,inicio_en,fin_en,ubicacion_servicio)
    values(offer.id,auth.uid(),offer.trabajador_id,offer.nombre,offer.precio_base,
        offer.duracion_estimada_minutos,offer.modalidad,p_inicio_en,finish,address) returning *;
end; $$;

create or replace function public.cambiar_estado_solicitud(
    p_solicitud_id uuid, p_estado_esperado public.estado_solicitud,
    p_destino public.estado_solicitud, p_motivo text default null
) returns setof public.solicitudes
language plpgsql security definer set search_path = '' as $$
declare booking public.solicitudes; owner_id uuid; worker boolean; reason text := nullif(trim(p_motivo),'');
begin
    select trabajador_id into owner_id from public.solicitudes where id=p_solicitud_id;
    if owner_id is null then raise exception 'Solicitud no encontrada' using errcode='P0002'; end if;
    perform pg_advisory_xact_lock(hashtextextended(owner_id::text, 1));
    select * into booking from public.solicitudes where id=p_solicitud_id for update;
    if not exists(select 1 from public.usuarios where id=auth.uid() and activo)
        or auth.uid() not in (booking.cliente_id,booking.trabajador_id) or auth.uid() is null then
        raise exception 'Solicitud no encontrada' using errcode='P0002';
    end if;
    worker := auth.uid()=booking.trabajador_id and public.es_trabajador();
    if booking.estado is distinct from p_estado_esperado then
        raise exception 'La solicitud cambio; vuelve a consultarla' using errcode='PT409';
    end if;
    if p_destino='CANCELADA' then
        if booking.estado not in ('PENDIENTE','ACEPTADA') or reason is null
            or char_length(reason) not between 3 and 500 then
            raise exception 'Cancelacion no permitida' using errcode='PT409';
        end if;
    elsif reason is not null or not worker or not (
        (booking.estado='PENDIENTE' and p_destino in ('ACEPTADA','RECHAZADA'))
        or (booking.modalidad='DOMICILIO' and booking.estado='PAGADA' and p_destino='EN_CAMINO')
        or (booking.modalidad='DOMICILIO' and booking.estado='EN_CAMINO' and p_destino='EN_CURSO')
        or (booking.modalidad='TALLER' and booking.estado='PAGADA' and p_destino='EN_CURSO')
        or (booking.modalidad='TALLER' and booking.estado='EN_CURSO' and p_destino='LISTO')
    ) then raise exception 'Transicion no permitida' using errcode='PT409';
    end if;
    if p_destino='ACEPTADA' then
        if booking.inicio_en <= now() or not exists(select 1 from public.disponibilidades
            where servicio_id=booking.servicio_id and inicio_en<=booking.inicio_en and fin_en>=booking.fin_en)
            or not exists(select 1 from public.buscar_servicios_catalogo(p_servicio_id=>booking.servicio_id)) then
            raise exception 'El servicio o el horario ya no estan disponibles' using errcode='PT409';
        end if;
        if exists(select 1 from public.solicitudes where trabajador_id=owner_id and id<>booking.id
            and estado in ('ACEPTADA','PAGADA','EN_CAMINO','EN_CURSO','LISTO')
            and tstzrange(inicio_en,fin_en,'[)') && tstzrange(booking.inicio_en,booking.fin_en,'[)')) then
            raise exception 'Conflicto de horario' using errcode='PT409';
        end if;
    end if;
    if p_destino='ACEPTADA' then
        update public.solicitudes set estado='RECHAZADA'
        where trabajador_id=owner_id and id<>booking.id and estado='PENDIENTE'
          and tstzrange(inicio_en,fin_en,'[)') && tstzrange(booking.inicio_en,booking.fin_en,'[)');
    end if;
    return query update public.solicitudes set estado=p_destino,
        motivo_cancelacion=case when p_destino='CANCELADA' then reason else null end
        where id=booking.id returning *;
end; $$;

create or replace function public.generar_codigo_solicitud(p_solicitud_id uuid,p_codigo text)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare booking public.solicitudes; expires timestamptz := now()+interval '24 hours';
begin
    select * into booking from public.solicitudes where id=p_solicitud_id for update;
    if not found or auth.uid() is distinct from booking.trabajador_id or not public.es_trabajador() then
        raise exception 'Operacion no permitida' using errcode='42501';
    end if;
    if p_codigo is null or p_codigo !~ '^[0-9]{6}$'
        or not ((booking.modalidad='DOMICILIO' and booking.estado='EN_CURSO')
            or (booking.modalidad='TALLER' and booking.estado='LISTO')) then
        raise exception 'No se puede generar el codigo en este estado' using errcode='PT409';
    end if;
    if exists(select 1 from public.confirmaciones_solicitud where solicitud_id=booking.id and intentos>=5) then
        raise exception 'El codigo esta bloqueado por intentos fallidos' using errcode='PT409';
    end if;
    -- Rotating the code never resets the failed-attempt budget.
    insert into public.confirmaciones_solicitud(solicitud_id,codigo_hash,expira_en)
    values(booking.id,sha256(convert_to(booking.id::text||':'||p_codigo,'UTF8')),expires)
    on conflict(solicitud_id) do update set codigo_hash=excluded.codigo_hash,expira_en=excluded.expira_en;
    return expires;
end; $$;

create or replace function public.completar_solicitud(p_solicitud_id uuid,p_codigo text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare booking public.solicitudes; confirmation public.confirmaciones_solicitud;
begin
    select * into booking from public.solicitudes where id=p_solicitud_id for update;
    if not found or auth.uid() is distinct from booking.cliente_id
        or not exists(select 1 from public.usuarios where id=auth.uid() and activo) then
        raise exception 'Solicitud no encontrada' using errcode='P0002';
    end if;
    if not ((booking.modalidad='DOMICILIO' and booking.estado='EN_CURSO')
        or (booking.modalidad='TALLER' and booking.estado='LISTO')) then
        raise exception 'Transicion no permitida' using errcode='PT409';
    end if;
    select * into confirmation from public.confirmaciones_solicitud where solicitud_id=booking.id for update;
    if not found or confirmation.expira_en<=now() or confirmation.intentos>=5 then
        return jsonb_build_object('error','codigo_no_disponible');
    end if;
    if p_codigo is null or p_codigo !~ '^[0-9]{6}$'
        or confirmation.codigo_hash <> sha256(convert_to(booking.id::text||':'||p_codigo,'UTF8')) then
        update public.confirmaciones_solicitud set intentos=intentos+1 where solicitud_id=booking.id;
        -- Return rather than raise so PostgREST commits the failed-attempt counter.
        return jsonb_build_object('error','codigo_invalido');
    end if;
    update public.solicitudes set estado='COMPLETADA' where id=booking.id returning * into booking;
    return to_jsonb(booking);
end; $$;

notify pgrst, 'reload schema';
commit;

