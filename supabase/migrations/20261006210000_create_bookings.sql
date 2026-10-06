-- SCRUM-45: private booking model. Writes will be exposed by controlled RPCs
-- in SCRUM-46; clients cannot insert or change ownership, snapshots or states.
begin;

create type public.estado_solicitud as enum (
    'PENDIENTE', 'ACEPTADA', 'PAGADA', 'EN_CAMINO', 'EN_CURSO',
    'LISTO', 'COMPLETADA', 'RECHAZADA', 'CANCELADA'
);

create table public.solicitudes (
    id uuid primary key default gen_random_uuid(),
    servicio_id uuid not null references public.servicios(id) on delete restrict,
    cliente_id uuid not null references public.usuarios(id) on delete restrict,
    trabajador_id uuid not null references public.trabajadores(usuario_id) on delete restrict,
    servicio_nombre text not null check (
        servicio_nombre = trim(servicio_nombre) and char_length(servicio_nombre) between 3 and 120
    ),
    precio_base bigint not null check (precio_base > 0),
    duracion_estimada_minutos integer not null check (duracion_estimada_minutos > 0),
    modalidad public.modalidad_servicio not null,
    inicio_en timestamptz not null,
    ubicacion_servicio text not null check (
        ubicacion_servicio = trim(ubicacion_servicio)
        and char_length(ubicacion_servicio) between 5 and 240
    ),
    estado public.estado_solicitud not null default 'PENDIENTE',
    motivo_cancelacion text,
    creado_en timestamptz not null default now(),
    actualizado_en timestamptz not null default now(),
    constraint solicitudes_participantes_distintos check (cliente_id <> trabajador_id),
    constraint solicitudes_estado_modalidad check (
        (modalidad = 'DOMICILIO' and estado <> 'LISTO')
        or (modalidad = 'TALLER' and estado <> 'EN_CAMINO')
    ),
    constraint solicitudes_cancelacion_coherente check (
        (estado = 'CANCELADA' and motivo_cancelacion is not null
            and motivo_cancelacion = trim(motivo_cancelacion)
            and char_length(motivo_cancelacion) between 3 and 500)
        or (estado <> 'CANCELADA' and motivo_cancelacion is null)
    )
);

create index solicitudes_cliente_agenda_idx on public.solicitudes(cliente_id, inicio_en);
create index solicitudes_trabajador_agenda_idx on public.solicitudes(trabajador_id, inicio_en);
create index solicitudes_servicio_idx on public.solicitudes(servicio_id);
create trigger solicitudes_actualizar_marca_de_tiempo
before update on public.solicitudes
for each row execute function public.actualizar_marca_de_tiempo();

alter table public.solicitudes enable row level security;
create policy solicitudes_leer_participantes on public.solicitudes
for select to authenticated
using (
    cliente_id = (select auth.uid())
    or trabajador_id = (select auth.uid())
    or (select public.es_admin())
);
revoke all on public.solicitudes from anon, authenticated;
grant select on public.solicitudes to authenticated;

commit;
