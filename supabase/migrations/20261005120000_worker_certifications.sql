-- Private professional certificates and mandatory category publication requirements.
create table public.certificaciones_trabajador (
    id uuid primary key default gen_random_uuid(),
    trabajador_id uuid not null references public.trabajadores(usuario_id) on delete cascade,
    categoria_id uuid not null references public.categorias(id) on delete restrict,
    nombre text not null check (nombre = trim(nombre) and char_length(nombre) between 3 and 120),
    documento_path text not null,
    estado public.estado_verificacion not null default 'PENDIENTE',
    motivo_rechazo text,
    revisado_por uuid references public.usuarios(id),
    revisado_en timestamptz,
    creado_en timestamptz not null default now(),
    actualizado_en timestamptz not null default now(),
    unique (trabajador_id, categoria_id),
    constraint certificaciones_revision_coherente check (
        (estado = 'PENDIENTE' and motivo_rechazo is null and revisado_por is null and revisado_en is null)
        or (estado = 'APROBADA' and motivo_rechazo is null and revisado_por is not null and revisado_en is not null)
        or (estado = 'RECHAZADA' and nullif(trim(motivo_rechazo), '') is not null
            and revisado_por is not null and revisado_en is not null)
    )
);
alter table public.certificaciones_trabajador enable row level security;
create policy certificaciones_leer on public.certificaciones_trabajador
for select to authenticated
using (trabajador_id = (select auth.uid()) or (select public.es_admin()));
create policy certificaciones_enviar on public.certificaciones_trabajador
for insert to authenticated
with check (trabajador_id = (select auth.uid()) and (select public.es_trabajador()));
create policy certificaciones_reenviar on public.certificaciones_trabajador
for update to authenticated
using (trabajador_id = (select auth.uid()) and estado = 'RECHAZADA' and (select public.es_trabajador()))
with check (trabajador_id = (select auth.uid()) and estado = 'PENDIENTE' and (select public.es_trabajador()));
revoke all on public.certificaciones_trabajador from anon, authenticated;
grant select on public.certificaciones_trabajador to authenticated;
grant insert (trabajador_id, categoria_id, nombre, documento_path)
on public.certificaciones_trabajador to authenticated;
grant update (nombre, documento_path) on public.certificaciones_trabajador to authenticated;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('certificaciones-trabajador', 'certificaciones-trabajador', false, 5242880,
    array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
create policy certificaciones_documentos_leer on storage.objects
for select to authenticated using (
    bucket_id = 'certificaciones-trabajador'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.es_admin()))
);
create policy certificaciones_documentos_subir on storage.objects
for insert to authenticated with check (
    bucket_id = 'certificaciones-trabajador'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.es_trabajador())
    and exists (select 1 from public.categorias c where c.id::text = (storage.foldername(name))[2]
        and c.activa and c.requiere_certificacion)
    and not exists (select 1 from public.certificaciones_trabajador c
        where c.trabajador_id = (select auth.uid())
        and c.categoria_id::text = (storage.foldername(name))[2]
        and c.estado in ('PENDIENTE', 'APROBADA'))
);
create policy certificaciones_documentos_limpiar on storage.objects
for delete to authenticated using (
    bucket_id = 'certificaciones-trabajador'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.es_trabajador())
    and not exists (select 1 from public.certificaciones_trabajador c where c.documento_path = name)
);

create function public.preparar_certificacion_trabajador()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
    if tg_op = 'INSERT' or new.documento_path is distinct from old.documento_path
        or new.nombre is distinct from old.nombre then
        if tg_op = 'UPDATE' and old.estado <> 'RECHAZADA' then
            raise exception 'Solo se puede reenviar una certificacion rechazada' using errcode = '23514';
        end if;
        if not exists (select 1 from public.categorias where id = new.categoria_id
            and activa and requiere_certificacion) then
            raise exception 'La categoria no requiere certificacion o no esta disponible' using errcode = '23514';
        end if;
        if new.documento_path not like new.trabajador_id::text || '/' || new.categoria_id::text || '/%'
            or not exists (select 1 from storage.objects where bucket_id = 'certificaciones-trabajador'
                and name = new.documento_path) then
            raise exception 'El documento debe pertenecer al trabajador y la categoria' using errcode = '23514';
        end if;
        if tg_op = 'UPDATE' and new.documento_path = old.documento_path then
            raise exception 'Debes adjuntar un nuevo documento para reenviar' using errcode = '23514';
        end if;
        new.estado := 'PENDIENTE';
        new.motivo_rechazo := null;
        new.revisado_por := null;
        new.revisado_en := null;
    elsif new.estado is distinct from old.estado then
        if old.estado <> 'PENDIENTE' or new.estado not in ('APROBADA', 'RECHAZADA')
            or not public.es_admin() or new.revisado_por is distinct from auth.uid() then
            raise exception 'Solo un administrador activo puede revisar certificaciones pendientes'
                using errcode = '42501';
        end if;
    end if;
    return new;
end;
$$;
revoke all on function public.preparar_certificacion_trabajador() from public;
create trigger certificaciones_preparar before insert or update
on public.certificaciones_trabajador for each row execute function public.preparar_certificacion_trabajador();
create trigger certificaciones_actualizar_marca_de_tiempo before update
on public.certificaciones_trabajador for each row execute function public.actualizar_marca_de_tiempo();

create function public.revisar_certificacion_trabajador(
    p_certificacion_id uuid, p_estado public.estado_verificacion, p_motivo text default null
)
returns setof public.certificaciones_trabajador
language plpgsql security definer set search_path = '' as $$
declare motivo text := nullif(trim(p_motivo), '');
begin
    if not public.es_admin() then
        raise exception 'Solo un administrador activo puede revisar certificaciones' using errcode = '42501';
    end if;
    if p_estado not in ('APROBADA', 'RECHAZADA')
        or (p_estado = 'RECHAZADA' and motivo is null)
        or (p_estado = 'APROBADA' and motivo is not null) then
        raise exception 'Revision invalida' using errcode = '22023';
    end if;
    return query update public.certificaciones_trabajador set estado = p_estado,
        motivo_rechazo = motivo, revisado_por = auth.uid(), revisado_en = now()
        where id = p_certificacion_id and estado = 'PENDIENTE' returning *;
    if not found then
        raise exception 'No existe una certificacion pendiente' using errcode = 'P0002';
    end if;
end;
$$;
revoke all on function public.revisar_certificacion_trabajador(uuid, public.estado_verificacion, text) from public;
grant execute on function public.revisar_certificacion_trabajador(uuid, public.estado_verificacion, text) to authenticated;

create function public.trabajador_certificado_para_categoria(p_trabajador_id uuid, p_categoria_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
    select exists (select 1 from public.categorias c where c.id = p_categoria_id
        and (not c.requiere_certificacion or exists (
            select 1 from public.certificaciones_trabajador v
            where v.trabajador_id = p_trabajador_id and v.categoria_id = c.id and v.estado = 'APROBADA'
        )));
$$;
revoke all on function public.trabajador_certificado_para_categoria(uuid, uuid) from public;
grant execute on function public.trabajador_certificado_para_categoria(uuid, uuid) to anon, authenticated;

create or replace function public.validar_publicacion_servicio()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
    if new.activo then
        if not exists (select 1 from public.categorias where id = new.categoria_id and activa) then
            raise exception 'La categoria seleccionada no esta disponible';
        end if;
        if not public.trabajador_puede_publicar(new.trabajador_id) then
            raise exception 'El trabajador debe tener su verificacion aprobada para publicar';
        end if;
        if not public.trabajador_certificado_para_categoria(new.trabajador_id, new.categoria_id) then
            raise exception 'La categoria requiere una certificacion aprobada' using errcode = '23514';
        end if;
        perform pg_advisory_xact_lock(hashtextextended(new.trabajador_id::text, 0));
        if (select count(*) from public.servicios where trabajador_id = new.trabajador_id
            and activo and id <> new.id) >= 5 then
            raise exception 'Un trabajador puede tener como maximo cinco servicios activos';
        end if;
    end if;
    return new;
end;
$$;
drop trigger servicios_validar_publicacion on public.servicios;
create trigger servicios_validar_publicacion before insert or update
on public.servicios for each row execute function public.validar_publicacion_servicio();

-- Hide existing uncertified offers too; workers can still read and disable their own offers.
drop policy servicios_catalogo_publico on public.servicios;
create policy servicios_catalogo_publico on public.servicios for select to anon, authenticated
using (activo and public.trabajador_certificado_para_categoria(trabajador_id, categoria_id));

-- The public RPC runs as owner, so its projection must enforce the requirement explicitly.
create or replace function public.buscar_servicios_catalogo(
    p_servicio_id uuid default null, p_q text default null, p_categoria_id uuid default null,
    p_modalidad public.modalidad_servicio default null, p_precio_min bigint default null,
    p_precio_max bigint default null, p_limit integer default 20, p_offset integer default 0
)
returns table (
    id uuid, nombre text, descripcion text, precio_base bigint, duracion_estimada_minutos integer,
    modalidad public.modalidad_servicio, categoria_id uuid, categoria_slug text, categoria_nombre text,
    categoria_descripcion text, categoria_requiere_certificacion boolean,
    categoria_certificacion_requerida text, categoria_orden smallint, trabajador_id uuid,
    trabajador_nombre text, comuna_id uuid, comuna_nombre text, creado_en timestamptz,
    actualizado_en timestamptz, total_count bigint
)
language sql stable security definer set search_path = '' as $$
    select s.id, s.nombre, s.descripcion, s.precio_base, s.duracion_estimada_minutos, s.modalidad,
        c.id, c.slug, c.nombre, c.descripcion, c.requiere_certificacion, c.certificacion_requerida,
        c.orden, t.usuario_id, u.nombre, co.id, co.nombre, s.creado_en, s.actualizado_en, count(*) over ()
    from public.servicios s join public.categorias c on c.id = s.categoria_id
    join public.trabajadores t on t.usuario_id = s.trabajador_id
    join public.usuarios u on u.id = t.usuario_id
    join public.verificaciones_trabajador v on v.trabajador_id = t.usuario_id
    left join public.comunas co on co.id = t.comuna_id
    where s.activo and c.activa and u.activo and u.rol = 'TRABAJADOR' and v.estado = 'APROBADA'
        and public.trabajador_certificado_para_categoria(s.trabajador_id, s.categoria_id)
        and (p_servicio_id is null or s.id = p_servicio_id)
        and (nullif(trim(p_q), '') is null or s.nombre ilike '%' || trim(p_q) || '%'
            or s.descripcion ilike '%' || trim(p_q) || '%')
        and (p_categoria_id is null or s.categoria_id = p_categoria_id)
        and (p_modalidad is null or s.modalidad = p_modalidad)
        and (p_precio_min is null or s.precio_base >= p_precio_min)
        and (p_precio_max is null or s.precio_base <= p_precio_max)
    order by s.creado_en desc, s.id limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
$$;
