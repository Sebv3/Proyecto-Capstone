-- SCRUM-54: academic payments. No gateway, charges or transfers.
begin;

create table public.pagos (
    id uuid primary key default gen_random_uuid(),
    solicitud_id uuid not null unique references public.solicitudes(id) on delete restrict,
    cliente_id uuid not null references public.usuarios(id) on delete restrict,
    trabajador_id uuid not null references public.trabajadores(usuario_id) on delete restrict,
    tarifa_base bigint not null check (tarifa_base > 0),
    comision bigint not null,
    monto_total bigint not null,
    moneda text not null default 'CLP' check (moneda = 'CLP'),
    estado text not null default 'APROBADO' check (estado = 'APROBADO'),
    simulado boolean not null default true check (simulado),
    creado_en timestamptz not null default now(),
    constraint pagos_montos_coherentes check (
        comision = round(tarifa_base::numeric * 15 / 100)
        and monto_total::numeric = tarifa_base::numeric + comision
    ),
    constraint pagos_participantes_distintos check (cliente_id <> trabajador_id)
);
create index pagos_cliente_idx on public.pagos(cliente_id);
create index pagos_trabajador_idx on public.pagos(trabajador_id);
alter table public.pagos enable row level security;
revoke all on public.pagos from anon, authenticated;
grant select on public.pagos to authenticated;
create policy pagos_participantes on public.pagos for select to authenticated using (
    exists(select 1 from public.usuarios where id = (select auth.uid()) and activo)
    and (cliente_id = (select auth.uid()) or trabajador_id = (select auth.uid())
        or (select public.es_admin()))
);

create function public.consultar_pago_solicitud(p_solicitud_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare booking public.solicitudes; payment public.pagos; fee bigint;
begin
    select * into booking from public.solicitudes where id = p_solicitud_id;
    if not found or auth.uid() is null
        or auth.uid() not in (booking.cliente_id, booking.trabajador_id)
        or not exists(select 1 from public.usuarios where id = auth.uid() and activo) then
        raise exception 'Solicitud no encontrada' using errcode = 'P0002';
    end if;
    select * into payment from public.pagos where solicitud_id = booking.id;
    fee := round(booking.precio_base::numeric * 15 / 100);
    return jsonb_build_object('tarifa_base', booking.precio_base, 'comision', fee,
        'monto_total', booking.precio_base + fee, 'moneda', 'CLP', 'simulado', true,
        'pago', case when payment.id is null then null else to_jsonb(payment) end);
end; $$;

create function public.simular_pago_solicitud(p_solicitud_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare booking public.solicitudes; payment public.pagos; owner_id uuid; fee bigint;
begin
    select trabajador_id into owner_id from public.solicitudes where id = p_solicitud_id;
    if owner_id is null then
        raise exception 'Solicitud no encontrada' using errcode = 'P0002';
    end if;
    -- Same lock order as cancellation/acceptance: worker, then booking.
    perform pg_advisory_xact_lock(hashtextextended(owner_id::text, 1));
    select * into booking from public.solicitudes where id = p_solicitud_id for update;
    if auth.uid() is distinct from booking.cliente_id or not exists(
        select 1 from public.usuarios where id = auth.uid() and rol = 'CLIENTE' and activo
    ) then
        raise exception 'Operacion no permitida' using errcode = '42501';
    end if;
    select * into payment from public.pagos where solicitud_id = booking.id;
    -- A retry returns the same payment, even if execution has already progressed.
    if payment.id is not null then
        return jsonb_build_object('pago', to_jsonb(payment), 'solicitud', to_jsonb(booking));
    end if;
    if booking.estado <> 'ACEPTADA' or booking.inicio_en <= now()
        or not exists(select 1 from public.usuarios where id = owner_id and activo) then
        raise exception 'La solicitud no admite pago' using errcode = 'PT409';
    end if;
    fee := round(booking.precio_base::numeric * 15 / 100);
    insert into public.pagos(solicitud_id, cliente_id, trabajador_id, tarifa_base, comision, monto_total)
    values(booking.id, booking.cliente_id, booking.trabajador_id,
        booking.precio_base, fee, booking.precio_base + fee) returning * into payment;
    update public.solicitudes set estado = 'PAGADA' where id = booking.id returning * into booking;
    return jsonb_build_object('pago', to_jsonb(payment), 'solicitud', to_jsonb(booking));
end; $$;
revoke all on function public.consultar_pago_solicitud(uuid) from public, anon;
revoke all on function public.simular_pago_solicitud(uuid) from public, anon;
grant execute on function public.consultar_pago_solicitud(uuid) to authenticated;
grant execute on function public.simular_pago_solicitud(uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
