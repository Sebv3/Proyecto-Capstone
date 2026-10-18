-- SCRUM-74. Test seller only; no real money or marketplace transfers.
begin;
alter table public.pagos add column proveedor text not null default 'SIMULADO'
    check (proveedor in ('SIMULADO','MERCADO_PAGO_TEST'));
alter table public.pagos add column proveedor_pago_id text unique;
alter table public.pagos add constraint pagos_proveedor_coherente check (
    (proveedor = 'SIMULADO' and proveedor_pago_id is null)
    or (proveedor = 'MERCADO_PAGO_TEST' and proveedor_pago_id is not null and proveedor_pago_id ~ '^[0-9]+$')
);
create table public.checkout_mercadopago (
    id uuid primary key default gen_random_uuid(),
    solicitud_id uuid not null unique references public.solicitudes(id) on delete restrict,
    cliente_id uuid not null references public.usuarios(id),
    trabajador_id uuid not null references public.trabajadores(usuario_id),
    servicio_nombre text not null,
    tarifa_base bigint not null check(tarifa_base > 0),
    comision bigint not null,
    monto_total bigint not null,
    expira_en timestamptz not null,
    preferencia_id text unique,
    checkout_url text,
    collector_id text,
    estado text not null default 'CREANDO' check(estado in
        ('CREANDO','LISTO','PENDIENTE','RECHAZADO','APROBADO','REVISION')),
    creado_en timestamptz not null default now(),
    actualizado_en timestamptz not null default now(),
    check(comision = round(tarifa_base::numeric * 15 / 100)
        and monto_total::numeric = tarifa_base::numeric + comision)
);
alter table public.checkout_mercadopago enable row level security;
revoke all on public.checkout_mercadopago from anon, authenticated;
grant select on public.checkout_mercadopago to authenticated;
create policy checkout_participantes on public.checkout_mercadopago for select to authenticated using (
    auth.uid() in (cliente_id, trabajador_id)
    and exists(select 1 from public.usuarios where id=auth.uid() and activo)
);
-- Audit contains only provider identifiers and reconciliation state, never card/customer data.
create table public.eventos_pago_mercadopago (
    pago_id text primary key check(pago_id ~ '^[0-9]+$'),
    checkout_id uuid not null references public.checkout_mercadopago(id) on delete cascade,
    estado text not null,
    proveedor_actualizado_en timestamptz not null,
    resultado text not null,
    actualizado_en timestamptz not null default now()
);
alter table public.eventos_pago_mercadopago enable row level security;
revoke all on public.eventos_pago_mercadopago from anon, authenticated;

create function public.iniciar_checkout_mercadopago(p_solicitud_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare b public.solicitudes; c public.checkout_mercadopago; owner_id uuid; fee bigint;
begin
    select trabajador_id into owner_id from public.solicitudes where id=p_solicitud_id;
    if owner_id is null then raise exception 'Solicitud no encontrada' using errcode='P0002'; end if;
    perform pg_advisory_xact_lock(hashtextextended(owner_id::text,1));
    select * into b from public.solicitudes where id=p_solicitud_id for update;
    if auth.uid() is distinct from b.cliente_id or not exists(
        select 1 from public.usuarios where id=auth.uid() and rol='CLIENTE' and activo
    ) then raise exception 'Operacion no permitida' using errcode='42501'; end if;
    if b.estado <> 'ACEPTADA' or b.inicio_en <= now()
        or exists(select 1 from public.pagos where solicitud_id=b.id)
        or not exists(select 1 from public.usuarios where id=owner_id and activo) then
        raise exception 'La solicitud no admite pago' using errcode='PT409'; end if;
    select * into c from public.checkout_mercadopago where solicitud_id=b.id;
    if found and c.estado in ('PENDIENTE','REVISION') then
        raise exception 'Pago pendiente o en revision' using errcode='PT409'; end if;
    if found then return jsonb_build_object('creado',false,'checkout',to_jsonb(c)); end if;
    fee:=round(b.precio_base::numeric * 15 / 100);
    insert into public.checkout_mercadopago(solicitud_id,cliente_id,trabajador_id,servicio_nombre,
        tarifa_base,comision,monto_total,expira_en)
    values(b.id,b.cliente_id,b.trabajador_id,b.servicio_nombre,b.precio_base,fee,b.precio_base+fee,b.inicio_en)
    returning * into c;
    return jsonb_build_object('creado',true,'checkout',to_jsonb(c));
end; $$;

create function public.guardar_preferencia_mercadopago(
    p_checkout_id uuid,p_preferencia_id text,p_checkout_url text,p_collector_id text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.checkout_mercadopago;
begin
    select * into c from public.checkout_mercadopago where id=p_checkout_id for update;
    if not found then raise exception 'Checkout no encontrado' using errcode='P0002'; end if;
    if p_preferencia_id is null or length(p_preferencia_id) not between 1 and 150
        or p_collector_id is null or p_collector_id !~ '^[0-9]+$'
        or p_checkout_url is null
        or p_checkout_url !~ '^https://www\.mercadopago\.(cl|com)/' then
        raise exception 'Preferencia invalida' using errcode='22023'; end if;
    if c.preferencia_id is not null and (c.preferencia_id <> p_preferencia_id or c.collector_id <> p_collector_id)
        then raise exception 'Preferencia ya vinculada' using errcode='PT409'; end if;
    update public.checkout_mercadopago set preferencia_id=p_preferencia_id,checkout_url=p_checkout_url,
        collector_id=p_collector_id,estado=case when estado='CREANDO' then 'LISTO' else estado end,
        actualizado_en=now() where id=c.id returning * into c;
    return to_jsonb(c);
end; $$;

create function public.procesar_pago_mercadopago(
    p_checkout_id uuid,p_pago_id text,p_estado text,p_monto numeric,p_moneda text,
    p_collector_id text,p_live_mode boolean,p_aprobado_en timestamptz,p_actualizado_en timestamptz
) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.checkout_mercadopago; b public.solicitudes; receipt public.pagos;
    previous public.eventos_pago_mercadopago; result text; owner_id uuid; booking_id uuid;
begin
    select trabajador_id,solicitud_id into owner_id,booking_id from public.checkout_mercadopago where id=p_checkout_id;
    if owner_id is null then raise exception 'Checkout no encontrado' using errcode='P0002'; end if;
    perform pg_advisory_xact_lock(hashtextextended(owner_id::text,1));
    select * into b from public.solicitudes where id=booking_id for update;
    select * into c from public.checkout_mercadopago where id=p_checkout_id for update;
    if p_live_mode is distinct from false or p_moneda is distinct from 'CLP'
        or p_monto is distinct from c.monto_total::numeric or p_collector_id is distinct from c.collector_id
        or c.collector_id is null or p_pago_id is null or p_pago_id !~ '^[0-9]+$'
        or p_estado is null or p_estado not in ('approved','pending','in_process','authorized','rejected',
            'cancelled','refunded','charged_back','in_mediation') or p_actualizado_en is null then
        raise exception 'Pago no coincide con checkout de prueba' using errcode='22023'; end if;
    select * into previous from public.eventos_pago_mercadopago where pago_id=p_pago_id;
    if found and previous.checkout_id <> c.id then raise exception 'Pago ya vinculado' using errcode='PT409'; end if;
    if found and previous.proveedor_actualizado_en >= p_actualizado_en then
        return jsonb_build_object('estado',c.estado,'resultado','REPETIDO'); end if;
    select * into receipt from public.pagos where solicitud_id=b.id;
    result:='REGISTRADO';
    if p_estado='approved' then
        if receipt.id is not null then
            if receipt.proveedor='MERCADO_PAGO_TEST' and receipt.proveedor_pago_id=p_pago_id then
                result:='YA_APROBADO';
            else result:='REVISION'; end if;
        elsif b.estado <> 'ACEPTADA' or p_aprobado_en is null or p_aprobado_en >= b.inicio_en
            or not exists(select 1 from public.usuarios where id=b.cliente_id and activo)
            or not exists(select 1 from public.usuarios where id=b.trabajador_id and activo) then
            result:='REVISION';
        else
            insert into public.pagos(solicitud_id,cliente_id,trabajador_id,tarifa_base,comision,
                monto_total,proveedor,proveedor_pago_id)
            values(b.id,b.cliente_id,b.trabajador_id,c.tarifa_base,c.comision,c.monto_total,
                'MERCADO_PAGO_TEST',p_pago_id);
            update public.solicitudes set estado='PAGADA' where id=b.id;
            update public.checkout_mercadopago set estado='APROBADO',actualizado_en=now() where id=c.id;
            result:='APROBADO';
        end if;
    elsif p_estado in ('refunded','charged_back','in_mediation') then
        result:='REVISION';
    elsif receipt.id is null and c.estado <> 'REVISION' then
        update public.checkout_mercadopago set estado=case when p_estado in ('rejected','cancelled')
            then 'RECHAZADO' else 'PENDIENTE' end, actualizado_en=now() where id=c.id;
    end if;
    if result='REVISION' then
        update public.checkout_mercadopago set estado='REVISION',actualizado_en=now() where id=c.id;
    end if;
    insert into public.eventos_pago_mercadopago(pago_id,checkout_id,estado,proveedor_actualizado_en,resultado)
    values(p_pago_id,c.id,p_estado,p_actualizado_en,result)
    on conflict(pago_id) do update set estado=excluded.estado,
        proveedor_actualizado_en=excluded.proveedor_actualizado_en,resultado=excluded.resultado,actualizado_en=now();
    select * into c from public.checkout_mercadopago where id=c.id;
    return jsonb_build_object('estado',c.estado,'resultado',result);
end; $$;

-- Keep the existing academic endpoint, but never allow it to bypass an active MP checkout.
alter function public.simular_pago_solicitud(uuid) rename to simular_pago_solicitud_sin_checkout;
revoke all on function public.simular_pago_solicitud_sin_checkout(uuid) from public,anon,authenticated;
create function public.simular_pago_solicitud(p_solicitud_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner_id uuid;
begin
    select trabajador_id into owner_id from public.solicitudes where id=p_solicitud_id;
    perform pg_advisory_xact_lock(hashtextextended(owner_id::text,1));
    perform 1 from public.solicitudes where id=p_solicitud_id for update;
    if exists(select 1 from public.checkout_mercadopago where solicitud_id=p_solicitud_id)
        then raise exception 'Solicitud vinculada a Mercado Pago' using errcode='PT409'; end if;
    return public.simular_pago_solicitud_sin_checkout(p_solicitud_id);
end; $$;
revoke all on function public.iniciar_checkout_mercadopago(uuid) from public,anon;
grant execute on function public.iniciar_checkout_mercadopago(uuid) to authenticated;
revoke all on function public.simular_pago_solicitud(uuid) from public,anon;
grant execute on function public.simular_pago_solicitud(uuid) to authenticated;
revoke all on function public.guardar_preferencia_mercadopago(uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.procesar_pago_mercadopago(uuid,text,text,numeric,text,text,boolean,timestamptz,timestamptz)
    from public,anon,authenticated;
grant execute on function public.guardar_preferencia_mercadopago(uuid,text,text,text) to service_role;
grant execute on function public.procesar_pago_mercadopago(uuid,text,text,numeric,text,text,boolean,timestamptz,timestamptz)
    to service_role;
grant select on public.checkout_mercadopago to service_role;
notify pgrst,'reload schema';
commit;
