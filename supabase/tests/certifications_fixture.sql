-- Only for an empty disposable PostgreSQL database. Never run against Supabase.
create role anon;
create role authenticated;
create schema auth;
create schema storage;
create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
create function storage.foldername(name text) returns text[] language sql immutable as $$
    select regexp_split_to_array(regexp_replace(name, '/[^/]*$', ''), '/');
$$;
grant usage on schema public, auth, storage to anon, authenticated;
create type public.estado_verificacion as enum ('PENDIENTE', 'APROBADA', 'RECHAZADA');
create type public.modalidad_servicio as enum ('DOMICILIO', 'TALLER');
create table public.usuarios(id uuid primary key, nombre text, rol text, activo boolean default true);
create table public.comunas(id uuid primary key, nombre text);
create table public.trabajadores(usuario_id uuid primary key references public.usuarios(id), comuna_id uuid);
create table public.verificaciones_trabajador(trabajador_id uuid primary key, estado public.estado_verificacion);
create table public.categorias(id uuid primary key, slug text, nombre text, descripcion text,
    requiere_certificacion boolean, certificacion_requerida text, orden smallint, activa boolean default true);
create table public.servicios(id uuid primary key default gen_random_uuid(), trabajador_id uuid,
    categoria_id uuid, nombre text, descripcion text, precio_base bigint,
    duracion_estimada_minutos integer, modalidad public.modalidad_servicio, activo boolean default true,
    creado_en timestamptz default now(), actualizado_en timestamptz default now());
create table storage.buckets(id text primary key, name text, public boolean,
    file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects(bucket_id text, name text, primary key(bucket_id, name));
alter table storage.objects enable row level security;
grant select, insert, delete on storage.objects to authenticated;
create function public.es_admin() returns boolean language sql stable security definer as $$
    select exists (select 1 from public.usuarios where id = auth.uid() and rol = 'ADMIN' and activo);
$$;
create function public.es_trabajador() returns boolean language sql stable security definer as $$
    select exists (select 1 from public.usuarios where id = auth.uid() and rol = 'TRABAJADOR' and activo);
$$;
create function public.trabajador_puede_publicar(p_id uuid) returns boolean
language sql stable security definer as $$
    select exists (select 1 from public.usuarios u join public.verificaciones_trabajador v
        on v.trabajador_id = u.id where u.id = p_id and u.activo and u.rol = 'TRABAJADOR'
        and v.estado = 'APROBADA');
$$;
create function public.actualizar_marca_de_tiempo() returns trigger language plpgsql as $$
begin new.actualizado_en := now(); return new; end;
$$;
create function public.validar_publicacion_servicio() returns trigger language plpgsql as $$
begin return new; end;
$$;
create trigger servicios_validar_publicacion before insert or update on public.servicios
for each row execute function public.validar_publicacion_servicio();
alter table public.servicios enable row level security;
create policy servicios_catalogo_publico on public.servicios for select to anon, authenticated using (activo);
create policy servicios_propios on public.servicios for all to authenticated
using (trabajador_id = auth.uid()) with check (trabajador_id = auth.uid());
grant select on public.servicios, public.categorias to anon, authenticated;
grant insert, update on public.servicios to authenticated;
insert into public.usuarios values
('11111111-1111-4111-8111-111111111111','Worker','TRABAJADOR',true),
('22222222-2222-4222-8222-222222222222','Other worker','TRABAJADOR',true),
('33333333-3333-4333-8333-333333333333','Admin','ADMIN',true),
('44444444-4444-4444-8444-444444444444','Inactive admin','ADMIN',false);
insert into public.trabajadores(usuario_id) select id from public.usuarios where rol = 'TRABAJADOR';
insert into public.verificaciones_trabajador select usuario_id,'APROBADA' from public.trabajadores;
insert into public.categorias values
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','electricidad','Electricidad','Electricidad domiciliaria',true,'Licencia SEC',1,true),
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','pintura','Pintura','Pintura domiciliaria',false,null,2,true),
('cccccccc-cccc-4ccc-8ccc-cccccccccccc','gas','Gas','Instalaciones de gas',true,'Licencia Gas',3,true);
-- An offer predating the requirement must be hidden by the migration.
insert into public.servicios(trabajador_id,categoria_id,nombre,descripcion,precio_base,duracion_estimada_minutos,modalidad)
values ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'Old service','Existing uncertified offer',10000,60,'DOMICILIO');
