begin;

create table public.notificaciones (
    id uuid primary key default gen_random_uuid(),
    usuario_id uuid not null references public.usuarios(id) on delete cascade,
    tipo text not null check (tipo in ('SOLICITUD','VERIFICACION','CERTIFICACION','ROL')),
    referencia_id uuid not null,
    categoria_id uuid,
    titulo text not null,
    mensaje text not null,
    creado_en timestamptz not null default now(),
    leida_en timestamptz
);
create index notificaciones_usuario_fecha_idx on public.notificaciones(usuario_id, creado_en desc, id desc);
create index notificaciones_no_leidas_idx on public.notificaciones(usuario_id) where leida_en is null;
alter table public.notificaciones enable row level security;
create policy notificaciones_propias on public.notificaciones for select to authenticated using (
    usuario_id = (select auth.uid()) and exists (
        select 1 from public.usuarios u where u.id = (select auth.uid()) and u.activo
    )
);
revoke all on public.notificaciones from anon, authenticated;
grant select on public.notificaciones to authenticated;

create function public.leer_notificaciones(p_id uuid default null)
returns integer language plpgsql security definer set search_path = '' as $$
declare affected integer;
begin
    if auth.uid() is null or not exists (
        select 1 from public.usuarios where id = auth.uid() and activo
    ) then
        raise exception 'Cuenta no autorizada' using errcode = '42501';
    end if;
    update public.notificaciones set leida_en = now()
    where usuario_id = auth.uid() and leida_en is null and (p_id is null or id = p_id);
    get diagnostics affected = row_count;
    return affected;
end; $$;
revoke all on function public.leer_notificaciones(uuid) from public, anon;
grant execute on function public.leer_notificaciones(uuid) to authenticated;

create function public.notificar_solicitud()
returns trigger language plpgsql security definer set search_path = '' as $$
declare label text; recipient uuid;
begin
    if tg_op = 'INSERT' then
        insert into public.notificaciones(usuario_id,tipo,referencia_id,titulo,mensaje)
        values(new.trabajador_id,'SOLICITUD',new.id,'Nueva solicitud',
            'Recibiste una solicitud para ' || new.servicio_nombre || '.');
        return new;
    end if;
    if new.estado is not distinct from old.estado then return new; end if;
    label := case new.estado::text
        when 'ACEPTADA' then 'Solicitud aceptada'
        when 'RECHAZADA' then 'Solicitud rechazada'
        when 'CANCELADA' then 'Solicitud cancelada'
        when 'PAGADA' then 'Pago confirmado'
        when 'EN_CAMINO' then 'Trabajador en camino'
        when 'EN_CURSO' then 'Servicio iniciado'
        when 'LISTO' then 'Servicio listo'
        when 'COMPLETADA' then 'Servicio completado'
        else 'Solicitud actualizada' end;
    foreach recipient in array array[new.cliente_id,new.trabajador_id] loop
        if recipient is distinct from auth.uid() then
            insert into public.notificaciones(usuario_id,tipo,referencia_id,titulo,mensaje)
            values(recipient,'SOLICITUD',new.id,label,new.servicio_nombre || ': ' || lower(label) || '.');
        end if;
    end loop;
    return new;
end; $$;
revoke all on function public.notificar_solicitud() from public, anon, authenticated;
create trigger solicitudes_notificar after insert or update of estado on public.solicitudes
for each row execute function public.notificar_solicitud();

create function public.notificar_revision()
returns trigger language plpgsql security definer set search_path = '' as $$
declare recipient uuid; reference uuid; kind text; category uuid; subject text; label text;
begin
    if new.estado is not distinct from old.estado then return new; end if;
    if tg_table_name = 'verificaciones_trabajador' then
        recipient := new.trabajador_id; reference := new.trabajador_id;
        kind := 'VERIFICACION'; subject := 'Verificación de identidad';
    elsif tg_table_name = 'certificaciones_trabajador' then
        recipient := new.trabajador_id; reference := new.id; category := new.categoria_id;
        kind := 'CERTIFICACION'; subject := 'Certificación';
    else
        recipient := new.usuario_id; reference := new.id;
        kind := 'ROL'; subject := 'Solicitud para ser trabajador';
    end if;
    label := case new.estado::text when 'APROBADA' then 'aprobada'
        when 'RECHAZADA' then 'rechazada' else 'en revisión' end;
    insert into public.notificaciones(usuario_id,tipo,referencia_id,categoria_id,titulo,mensaje)
    values(recipient,kind,reference,category,subject || ' ' || label,
        subject || ' ' || label || '. Abre el aviso para consultar los detalles.');
    return new;
end; $$;
revoke all on function public.notificar_revision() from public, anon, authenticated;
create trigger verificaciones_notificar after update of estado on public.verificaciones_trabajador
for each row execute function public.notificar_revision();
create trigger certificaciones_notificar after update of estado on public.certificaciones_trabajador
for each row execute function public.notificar_revision();
create trigger solicitudes_rol_notificar after update of estado on public.solicitudes_rol_trabajador
for each row execute function public.notificar_revision();

notify pgrst, 'reload schema';
commit;
