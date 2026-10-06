-- Public establishments are separate from a worker's private base address.
create table public.locales (
    id uuid primary key default gen_random_uuid(),
    trabajador_id uuid not null references public.trabajadores(usuario_id) on delete cascade,
    nombre text not null check (char_length(trim(nombre)) between 3 and 120),
    direccion_publica text not null check (char_length(trim(direccion_publica)) between 5 and 240),
    latitud numeric(9,6) not null check (latitud between -90 and 90),
    longitud numeric(9,6) not null check (longitud between -180 and 180),
    activo boolean not null default true,
    creado_en timestamptz not null default now(),
    actualizado_en timestamptz not null default now()
);
create index locales_trabajador_idx on public.locales(trabajador_id);
create trigger locales_actualizar_marca_de_tiempo before update on public.locales
    for each row execute function public.actualizar_marca_de_tiempo();
alter table public.locales enable row level security;
revoke all on public.locales from anon, authenticated;
grant select on public.locales to anon, authenticated;

-- No client/worker writes in this sprint: administrators register establishments via SQL.
create policy locales_catalogo_publico on public.locales for select to anon, authenticated
using (activo and public.trabajador_puede_publicar(trabajador_id) and exists (
    select 1 from public.servicios s join public.categorias c on c.id = s.categoria_id
    where s.trabajador_id = locales.trabajador_id and s.activo and c.activa
        and s.modalidad = 'TALLER'
        and public.trabajador_certificado_para_categoria(s.trabajador_id, s.categoria_id)
));

create function public.consultar_locales_catalogo(p_local_id uuid default null)
returns table (
    id uuid, trabajador_id uuid, nombre text, direccion_publica text,
    latitud numeric, longitud numeric, trabajador_nombre text, servicios jsonb
)
language sql stable security definer set search_path = '' as $$
    select l.id, l.trabajador_id, l.nombre, l.direccion_publica, l.latitud, l.longitud,
        u.nombre, jsonb_agg(jsonb_build_object(
            'id', s.id, 'nombre', s.nombre, 'precio_base', s.precio_base,
            'categoria_id', c.id, 'categoria_nombre', c.nombre
        ) order by s.nombre, s.id)
    from public.locales l
    join public.trabajadores t on t.usuario_id = l.trabajador_id
    join public.usuarios u on u.id = t.usuario_id
    join public.verificaciones_trabajador v on v.trabajador_id = t.usuario_id
    join public.servicios s on s.trabajador_id = t.usuario_id
    join public.categorias c on c.id = s.categoria_id
    where l.activo and u.activo and u.rol = 'TRABAJADOR' and v.estado = 'APROBADA'
        and s.activo and c.activa and s.modalidad = 'TALLER'
        and public.trabajador_certificado_para_categoria(s.trabajador_id, s.categoria_id)
        and (p_local_id is null or l.id = p_local_id)
    group by l.id, u.nombre order by l.nombre, l.id;
$$;
revoke all on function public.consultar_locales_catalogo(uuid) from public;
grant execute on function public.consultar_locales_catalogo(uuid) to anon, authenticated;
