-- Service catalog foundation for Sprint 3.

create type public.modalidad_servicio as enum ('DOMICILIO', 'TALLER');

create table public.categorias (
    id uuid primary key default gen_random_uuid(),
    slug text not null unique,
    nombre text not null unique,
    descripcion text not null,
    requiere_certificacion boolean not null default false,
    certificacion_requerida text,
    activa boolean not null default true,
    orden smallint not null unique,
    creado_en timestamptz not null default now(),
    actualizado_en timestamptz not null default now(),
    constraint categorias_slug_valido check (
        slug = lower(trim(slug))
        and slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    ),
    constraint categorias_nombre_valido check (
        nombre = trim(nombre)
        and char_length(nombre) between 2 and 100
    ),
    constraint categorias_descripcion_valida check (
        descripcion = trim(descripcion)
        and char_length(descripcion) between 10 and 500
    ),
    constraint categorias_certificacion_coherente check (
        (requiere_certificacion and nullif(trim(certificacion_requerida), '') is not null)
        or (not requiere_certificacion and certificacion_requerida is null)
    ),
    constraint categorias_orden_valido check (orden > 0)
);

create trigger categorias_actualizar_marca_de_tiempo
before update on public.categorias
for each row execute function public.actualizar_marca_de_tiempo();

create table public.servicios (
    id uuid primary key default gen_random_uuid(),
    trabajador_id uuid not null
        references public.trabajadores (usuario_id) on delete cascade,
    categoria_id uuid not null
        references public.categorias (id) on delete restrict,
    nombre text not null,
    descripcion text not null,
    precio_base bigint not null,
    duracion_estimada_minutos integer not null,
    modalidad public.modalidad_servicio not null,
    activo boolean not null default true,
    creado_en timestamptz not null default now(),
    actualizado_en timestamptz not null default now(),
    constraint servicios_nombre_valido check (
        nombre = trim(nombre)
        and char_length(nombre) between 3 and 120
    ),
    constraint servicios_descripcion_valida check (
        descripcion = trim(descripcion)
        and char_length(descripcion) between 10 and 1000
    ),
    constraint servicios_precio_valido check (precio_base > 0),
    constraint servicios_duracion_valida check (duracion_estimada_minutos > 0)
);

create index servicios_trabajador_id_idx
on public.servicios (trabajador_id);

create index servicios_categoria_activo_idx
on public.servicios (categoria_id, activo);

create index servicios_precio_activo_idx
on public.servicios (precio_base, activo);

create trigger servicios_actualizar_marca_de_tiempo
before update on public.servicios
for each row execute function public.actualizar_marca_de_tiempo();

create or replace function public.trabajador_puede_publicar(
    p_trabajador_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
        from public.usuarios as usuario
        join public.trabajadores as trabajador
          on trabajador.usuario_id = usuario.id
        join public.verificaciones_trabajador as verificacion
          on verificacion.trabajador_id = trabajador.usuario_id
        where usuario.id = p_trabajador_id
          and usuario.rol = 'TRABAJADOR'
          and usuario.activo
          and verificacion.estado = 'APROBADA'
    );
$$;

revoke all on function public.trabajador_puede_publicar(uuid) from public;
grant execute on function public.trabajador_puede_publicar(uuid) to authenticated;

create or replace function public.validar_publicacion_servicio()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if not exists (
        select 1 from public.categorias
        where id = new.categoria_id
          and activa
    ) then
        raise exception 'La categoria seleccionada no esta disponible';
    end if;

    if new.activo then
        if not public.trabajador_puede_publicar(new.trabajador_id) then
            raise exception 'El trabajador debe tener su verificacion aprobada para publicar';
        end if;

        perform pg_advisory_xact_lock(hashtextextended(new.trabajador_id::text, 0));
        if (
            select count(*)
            from public.servicios
            where trabajador_id = new.trabajador_id
              and activo
              and id <> new.id
        ) >= 5 then
            raise exception 'Un trabajador puede tener como maximo cinco servicios activos';
        end if;
    end if;

    return new;
end;
$$;

create trigger servicios_validar_publicacion
before insert or update of trabajador_id, categoria_id, activo
on public.servicios
for each row execute function public.validar_publicacion_servicio();

alter table public.categorias enable row level security;
alter table public.servicios enable row level security;

create policy categorias_catalogo_publico
on public.categorias
for select to anon, authenticated
using (activa);

create policy categorias_administrar
on public.categorias
for all to authenticated
using ((select public.es_admin()))
with check ((select public.es_admin()));

create policy servicios_catalogo_publico
on public.servicios
for select to anon, authenticated
using (activo);

create policy servicios_leer_propios
on public.servicios
for select to authenticated
using (trabajador_id = (select auth.uid()));

create policy servicios_administrar
on public.servicios
for all to authenticated
using ((select public.es_admin()))
with check ((select public.es_admin()));

create policy servicios_crear_propios
on public.servicios
for insert to authenticated
with check (
    trabajador_id = (select auth.uid())
    and (select public.es_trabajador())
);

create policy servicios_editar_propios
on public.servicios
for update to authenticated
using (
    trabajador_id = (select auth.uid())
    and (select public.es_trabajador())
)
with check (
    trabajador_id = (select auth.uid())
    and (select public.es_trabajador())
);

create policy servicios_eliminar_propios
on public.servicios
for delete to authenticated
using (
    trabajador_id = (select auth.uid())
    and (select public.es_trabajador())
);

revoke all on table public.categorias from anon, authenticated;
grant select on table public.categorias to anon, authenticated;
grant insert, update, delete on table public.categorias to authenticated;

revoke all on table public.servicios from anon, authenticated;
grant select on table public.servicios to anon, authenticated;
grant insert, delete on table public.servicios to authenticated;
grant update (
    categoria_id, nombre, descripcion, precio_base,
    duracion_estimada_minutos, modalidad, activo
) on table public.servicios to authenticated;

insert into public.categorias (
    slug, nombre, descripcion, requiere_certificacion,
    certificacion_requerida, orden
)
values
    ('instalaciones-electricas', 'Instalaciones y reparaciones eléctricas',
     'Instalación y reparación eléctrica domiciliaria de baja tensión.', true,
     'Licencia de Instalador Eléctrico SEC Clase D', 1),
    ('gasfiteria-gas', 'Gasfitería domiciliaria y artefactos a gas',
     'Mantención de artefactos y redes interiores de gas domiciliarias.', true,
     'Licencia de Instalador de Gas SEC Clase 3', 2),
    ('climatizacion', 'Climatización básica',
     'Instalación y mantención de climatización para viviendas y oficinas pequeñas.', true,
     'Certificación ChileValora en climatización o Licencia SEC Clase D', 3),
    ('seguridad-electronica', 'Seguridad electrónica e intrusión',
     'Instalación de cámaras, videoporteros, alarmas y accesos electrónicos.', true,
     'Acreditación OS10 o certificación del fabricante', 4),
    ('cerrajeria', 'Cerrajería',
     'Apertura de puertas, cambio de combinaciones, chapas y copias de llaves.', false,
     null, 5),
    ('calzado-vestuario', 'Calzado y vestuario',
     'Limpieza y reparación de calzado, ajustes y confección básica de ropa.', false,
     null, 6),
    ('carpinteria-muebleria', 'Carpintería y mueblería',
     'Reparación de puertas, bisagras, sillas, mesas y muebles de madera.', false,
     null, 7),
    ('pintura-terminaciones', 'Pintura y terminaciones',
     'Pintura interior y exterior, pasta muro y fijación de elementos.', false,
     null, 8),
    ('jardineria-paisajismo', 'Jardinería y paisajismo',
     'Corte de césped, poda, riego y limpieza de terrenos.', false,
     null, 9),
    ('aseo-limpieza', 'Aseo y limpieza profunda',
     'Limpieza de viviendas, vehículos, alfombras y tapices.', false,
     null, 10),
    ('cuidado-mascotas', 'Cuidado y paseo de mascotas',
     'Paseo y cuidado temporal de mascotas.', false,
     null, 11),
    ('gasfiteria-sanitaria', 'Gasfitería e instalaciones sanitarias',
     'Instalación y reparación de redes de agua, sanitarios, grifería y desagües.', false,
     null, 12),
    ('bicicletas', 'Mantención y armado de bicicletas',
     'Armado, ajuste, lubricación y reparación básica de bicicletas.', false,
     null, 13)
on conflict (slug) do update
set nombre = excluded.nombre,
    descripcion = excluded.descripcion,
    requiere_certificacion = excluded.requiere_certificacion,
    certificacion_requerida = excluded.certificacion_requerida,
    activa = true,
    orden = excluded.orden;

comment on table public.categorias is
    'Initial service catalog categories, including certification requirements.';
comment on table public.servicios is
    'Worker service offers priced in Chilean pesos.';
comment on column public.servicios.precio_base is
    'Base price in whole Chilean pesos; platform commission is calculated later.';
comment on column public.servicios.duracion_estimada_minutos is
    'Worker-provided estimated duration in minutes.';
