-- SCRUM-55: one immutable client review per completed booking.
begin;
create table public.calificaciones (
    id uuid primary key default gen_random_uuid(),
    solicitud_id uuid not null unique references public.solicitudes(id) on delete restrict,
    cliente_id uuid not null references public.usuarios(id) on delete restrict,
    trabajador_id uuid not null references public.trabajadores(usuario_id) on delete restrict,
    servicio_id uuid not null references public.servicios(id) on delete restrict,
    servicio_nombre text not null,
    puntuacion smallint not null check (puntuacion between 1 and 5),
    comentario text check (comentario is null or
        (comentario=trim(comentario) and char_length(comentario) between 1 and 1000)),
    creado_en timestamptz not null default now(),
    check (cliente_id <> trabajador_id)
);
create index calificaciones_trabajador_fecha_idx on public.calificaciones(trabajador_id,creado_en desc,id desc);
alter table public.calificaciones enable row level security;
revoke all on public.calificaciones from anon,authenticated;
grant select on public.calificaciones to authenticated;
create policy calificaciones_participantes on public.calificaciones for select to authenticated using (
    exists(select 1 from public.usuarios where id=(select auth.uid()) and activo)
    and (cliente_id=(select auth.uid()) or trabajador_id=(select auth.uid()) or (select public.es_admin()))
);

create function public.crear_calificacion(p_solicitud_id uuid,p_puntuacion integer,p_comentario text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare booking public.solicitudes; review public.calificaciones; content text := nullif(trim(p_comentario),'');
begin
    select * into booking from public.solicitudes where id=p_solicitud_id for update;
    if not found or auth.uid() is distinct from booking.cliente_id or not exists(
        select 1 from public.usuarios where id=auth.uid() and rol='CLIENTE' and activo
    ) then raise exception 'Operacion no permitida' using errcode='42501'; end if;
    if booking.estado<>'COMPLETADA' then
        raise exception 'Solo se califican servicios completados' using errcode='PT409';
    end if;
    if p_puntuacion is null or p_puntuacion not between 1 and 5 or char_length(content)>1000 then
        raise exception 'Calificacion invalida' using errcode='22023';
    end if;
    select * into review from public.calificaciones where solicitud_id=booking.id;
    if found then
        if review.puntuacion<>p_puntuacion or review.comentario is distinct from content then
            raise exception 'La solicitud ya tiene calificacion' using errcode='PT409';
        end if;
        return jsonb_build_object('calificacion',to_jsonb(review),'creada',false);
    end if;
    insert into public.calificaciones(solicitud_id,cliente_id,trabajador_id,servicio_id,servicio_nombre,puntuacion,comentario)
    values(booking.id,booking.cliente_id,booking.trabajador_id,booking.servicio_id,booking.servicio_nombre,p_puntuacion,content)
    returning * into review;
    return jsonb_build_object('calificacion',to_jsonb(review),'creada',true);
end; $$;

create function public.consultar_calificacion_solicitud(p_solicitud_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare booking public.solicitudes; review public.calificaciones;
begin
    select * into booking from public.solicitudes where id=p_solicitud_id;
    if not found or auth.uid() is null or auth.uid() not in (booking.cliente_id,booking.trabajador_id)
        or not exists(select 1 from public.usuarios where id=auth.uid() and activo) then
        raise exception 'Solicitud no encontrada' using errcode='P0002';
    end if;
    select * into review from public.calificaciones where solicitud_id=booking.id;
    return jsonb_build_object('calificacion',case when found then to_jsonb(review) else null end);
end; $$;

create function public.consultar_calificaciones_trabajador(p_trabajador_id uuid,p_limit integer default 20,p_offset integer default 0)
returns jsonb language plpgsql security definer set search_path='' as $$
declare average numeric; amount bigint; items jsonb;
begin
    if not public.trabajador_puede_publicar(p_trabajador_id) then
        raise exception 'Trabajador no disponible' using errcode='P0002';
    end if;
    if p_limit is null or p_limit not between 1 and 100 or p_offset is null or p_offset<0 then
        raise exception 'Paginacion invalida' using errcode='22023';
    end if;
    select round(avg(puntuacion)::numeric,2),count(*) into average,amount
    from public.calificaciones where trabajador_id=p_trabajador_id;
    select coalesce(jsonb_agg(to_jsonb(r) order by r.creado_en desc,r.id desc),'[]'::jsonb) into items
    from (select id,puntuacion,comentario,servicio_nombre,creado_en from public.calificaciones
        where trabajador_id=p_trabajador_id order by creado_en desc,id desc limit p_limit offset p_offset) r;
    return jsonb_build_object('trabajador_id',p_trabajador_id,'promedio',average,'cantidad',amount,
        'items',items,'limit',p_limit,'offset',p_offset,'has_more',amount>p_offset::bigint+p_limit);
end; $$;
revoke all on function public.crear_calificacion(uuid,integer,text) from public,anon;
revoke all on function public.consultar_calificacion_solicitud(uuid) from public,anon;
revoke all on function public.consultar_calificaciones_trabajador(uuid,integer,integer) from public;
grant execute on function public.crear_calificacion(uuid,integer,text) to authenticated;
grant execute on function public.consultar_calificacion_solicitud(uuid) to authenticated;
grant execute on function public.consultar_calificaciones_trabajador(uuid,integer,integer) to anon,authenticated;
notify pgrst,'reload schema';
commit;
