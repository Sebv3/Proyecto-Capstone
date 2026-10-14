-- SCRUM-53: private chat, retained only while its service request is active.
begin;
create table public.conversaciones (
    id uuid primary key default gen_random_uuid(),
    solicitud_id uuid not null unique references public.solicitudes(id) on delete cascade,
    creado_en timestamptz not null default now()
);
create table public.mensajes (
    id uuid primary key,
    conversacion_id uuid not null references public.conversaciones(id) on delete cascade,
    autor_id uuid not null references public.usuarios(id) on delete restrict,
    contenido text not null check (contenido=trim(contenido) and char_length(contenido) between 1 and 2000),
    creado_en timestamptz not null default now(),
    editado_en timestamptz
);
create index mensajes_conversacion_fecha_idx on public.mensajes(conversacion_id,creado_en desc,id desc);
alter table public.conversaciones enable row level security;
alter table public.mensajes enable row level security;
revoke all on public.conversaciones,public.mensajes from anon,authenticated;
grant select on public.conversaciones,public.mensajes to authenticated;
create policy conversaciones_participantes on public.conversaciones for select to authenticated using (
    exists(select 1 from public.solicitudes s where s.id=solicitud_id
        and auth.uid() in (s.cliente_id,s.trabajador_id)
        and s.estado not in ('COMPLETADA','CANCELADA','RECHAZADA'))
    and exists(select 1 from public.usuarios where id=auth.uid() and activo)
);
create policy mensajes_participantes on public.mensajes for select to authenticated using (
    exists(select 1 from public.conversaciones c where c.id=conversacion_id)
);

create function public.eliminar_chat_finalizado() returns trigger
language plpgsql security definer set search_path='' as $$ begin
    if new.estado in ('COMPLETADA','CANCELADA','RECHAZADA') then
        delete from public.conversaciones where solicitud_id=new.id;
    end if;
    return new;
end; $$;
revoke all on function public.eliminar_chat_finalizado() from public,anon,authenticated;
create trigger solicitudes_eliminar_chat after update of estado on public.solicitudes
for each row execute function public.eliminar_chat_finalizado();

create function public.gestionar_chat_solicitud(
    p_solicitud_id uuid,p_accion text,p_contenido text default null,
    p_mensaje_id uuid default null,p_limit integer default 50,p_offset integer default 0
) returns jsonb language plpgsql security definer set search_path='' as $$
declare booking public.solicitudes; conversation public.conversaciones; message public.mensajes;
    owner_id uuid; counterpart text; page jsonb; more boolean;
begin
    select trabajador_id into owner_id from public.solicitudes where id=p_solicitud_id;
    if owner_id is null then raise exception 'Solicitud no encontrada' using errcode='P0002'; end if;
    perform pg_advisory_xact_lock(hashtextextended(owner_id::text,1));
    select * into booking from public.solicitudes where id=p_solicitud_id for update;
    if auth.uid() is null or auth.uid() not in (booking.cliente_id,booking.trabajador_id)
        or not exists(select 1 from public.usuarios where id=auth.uid() and activo) then
        raise exception 'Solicitud no encontrada' using errcode='P0002';
    end if;
    if booking.estado in ('COMPLETADA','CANCELADA','RECHAZADA') then
        raise exception 'Chat cerrado' using errcode='PT410';
    end if;
    if p_accion not in ('ABRIR','LEER','ENVIAR','EDITAR','ELIMINAR') or p_accion is null
        or p_limit is null or p_limit not between 1 and 100 or p_offset is null or p_offset<0 then
        raise exception 'Datos invalidos' using errcode='22023';
    end if;
    if p_accion='ABRIR' then
        insert into public.conversaciones(solicitud_id) values(booking.id) on conflict(solicitud_id) do nothing;
    end if;
    select * into conversation from public.conversaciones where solicitud_id=booking.id;
    if p_accion in ('ABRIR','LEER') then
        select nombre into counterpart from public.usuarios
        where id=case when auth.uid()=booking.cliente_id then booking.trabajador_id else booking.cliente_id end;
        select coalesce(jsonb_agg(to_jsonb(m) order by m.creado_en,m.id),'[]'::jsonb) into page
        from (select * from public.mensajes where conversacion_id=conversation.id
            order by creado_en desc,id desc limit p_limit offset p_offset) m;
        select exists(select 1 from public.mensajes where conversacion_id=conversation.id
            order by creado_en desc,id desc offset p_offset+p_limit limit 1) into more;
        return jsonb_build_object('solicitud_id',booking.id,'conversacion_id',conversation.id,
            'contraparte_nombre',counterpart,'servicio_nombre',booking.servicio_nombre,
            'items',page,'limit',p_limit,'offset',p_offset,'has_more',more);
    end if;
    if conversation.id is null then raise exception 'Conversacion no encontrada' using errcode='P0002'; end if;
    if p_mensaje_id is null or (p_accion in ('ENVIAR','EDITAR') and
        (p_contenido is null or char_length(trim(p_contenido)) not between 1 and 2000)) then
        raise exception 'Mensaje invalido' using errcode='22023';
    end if;
    if p_accion='ENVIAR' then
        insert into public.mensajes(id,conversacion_id,autor_id,contenido)
        values(p_mensaje_id,conversation.id,auth.uid(),trim(p_contenido)) on conflict(id) do nothing;
        select * into message from public.mensajes where id=p_mensaje_id
            and conversacion_id=conversation.id and autor_id=auth.uid();
        if not found or message.contenido<>trim(p_contenido) then
            raise exception 'Mensaje duplicado incompatible' using errcode='PT409';
        end if;
    elsif p_accion='EDITAR' then
        update public.mensajes set contenido=trim(p_contenido),editado_en=now()
        where id=p_mensaje_id and conversacion_id=conversation.id and autor_id=auth.uid() returning * into message;
        if not found then raise exception 'Mensaje no encontrado' using errcode='P0002'; end if;
    else
        delete from public.mensajes where id=p_mensaje_id and conversacion_id=conversation.id and autor_id=auth.uid();
        if not found then raise exception 'Mensaje no encontrado' using errcode='P0002'; end if;
        return jsonb_build_object('ok',true);
    end if;
    return to_jsonb(message);
end; $$;
revoke all on function public.gestionar_chat_solicitud(uuid,text,text,uuid,integer,integer) from public,anon;
grant execute on function public.gestionar_chat_solicitud(uuid,text,text,uuid,integer,integer) to authenticated;
notify pgrst,'reload schema';
commit;
