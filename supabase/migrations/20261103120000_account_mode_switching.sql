-- usuarios.rol is the active mode; approved worker identity survives mode changes.
-- Apply after the previous migrations. No existing profiles or documents are deleted.
begin;

create function public.consultar_modos_cuenta()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare actor public.usuarios;
begin
    select * into actor from public.usuarios where id = auth.uid() and activo;
    if not found or actor.rol not in ('CLIENTE', 'TRABAJADOR') then
        raise exception 'Se requiere una cuenta activa de cliente o trabajador'
            using errcode = '42501';
    end if;
    return jsonb_build_object(
        'rol_activo', actor.rol,
        'puede_ser_cliente', true,
        'puede_ser_trabajador', exists (
            select 1 from public.trabajadores t
            join public.verificaciones_trabajador v on v.trabajador_id = t.usuario_id
            where t.usuario_id = actor.id and v.estado = 'APROBADA'
        ),
        'tiene_perfil_trabajador', exists (
            select 1 from public.trabajadores where usuario_id = actor.id
        ),
        'perfil_cliente_completo', exists (
            select 1 from public.clientes where usuario_id = actor.id
        )
    );
end; $$;

create function public.cambiar_modo_cuenta(p_rol text)
returns setof public.usuarios language plpgsql security definer set search_path = '' as $$
declare actor public.usuarios; approved public.estado_verificacion;
begin
    if p_rol is null or p_rol not in ('CLIENTE', 'TRABAJADOR') then
        raise exception 'Modo no permitido' using errcode = '22023';
    end if;
    select * into actor from public.usuarios where id = auth.uid() for update;
    if not found or not actor.activo or actor.rol not in ('CLIENTE', 'TRABAJADOR') then
        raise exception 'Se requiere una cuenta activa de cliente o trabajador'
            using errcode = '42501';
    end if;
    if p_rol = 'TRABAJADOR' then
        -- Never infer authorization from an old role request or client input.
        select v.estado into approved from public.verificaciones_trabajador v
        join public.trabajadores t on t.usuario_id = v.trabajador_id
        where t.usuario_id = actor.id for share of v, t;
        if approved is distinct from 'APROBADA'::public.estado_verificacion then
            raise exception 'El perfil de trabajador debe estar aprobado'
                using errcode = '42501';
        end if;
    end if;
    -- Idempotent retries use an explicit target, never a toggle.
    if actor.rol::text <> p_rol then
        update public.usuarios set rol = p_rol::public.usuario_rol where id = actor.id;
    end if;
    return query select * from public.usuarios where id = actor.id;
end; $$;

revoke all on function public.consultar_modos_cuenta() from public, anon;
revoke all on function public.cambiar_modo_cuenta(text) from public, anon;
grant execute on function public.consultar_modos_cuenta() to authenticated;
grant execute on function public.cambiar_modo_cuenta(text) to authenticated;

-- Catalog eligibility is authorization, not the user's current menu selection.
create or replace function public.trabajador_puede_publicar(p_trabajador_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
    select exists (
        select 1 from public.usuarios u
        join public.trabajadores t on t.usuario_id = u.id
        join public.verificaciones_trabajador v on v.trabajador_id = t.usuario_id
        where u.id = p_trabajador_id and u.activo
          and u.rol in ('CLIENTE', 'TRABAJADOR') and v.estado = 'APROBADA'
    );
$$;

-- Keep the existing public projection and filters; only decouple active mode.
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
    actualizado_en timestamptz, ubicacion_publica text, latitud numeric, longitud numeric,
    radio_cobertura_km integer, comuna_taller_id uuid, comuna_taller_nombre text, total_count bigint
)
language sql stable security definer set search_path = '' as $$
    select s.id, s.nombre, s.descripcion, s.precio_base, s.duracion_estimada_minutos, s.modalidad,
        c.id, c.slug, c.nombre, c.descripcion, c.requiere_certificacion, c.certificacion_requerida,
        c.orden, t.usuario_id, u.nombre, co.id, co.nombre, s.creado_en, s.actualizado_en,
        s.ubicacion_publica, s.latitud, s.longitud, s.radio_cobertura_km,
        taller_co.id, taller_co.nombre, count(*) over ()
    from public.servicios s join public.categorias c on c.id = s.categoria_id
    join public.trabajadores t on t.usuario_id = s.trabajador_id
    join public.usuarios u on u.id = t.usuario_id
    join public.verificaciones_trabajador v on v.trabajador_id = t.usuario_id
    left join public.comunas co on co.id = t.comuna_id
    left join public.comunas taller_co on taller_co.id = s.comuna_taller_id
    where s.activo and c.activa and public.trabajador_puede_publicar(u.id)
        and public.trabajador_certificado_para_categoria(s.trabajador_id, s.categoria_id)
        and (p_servicio_id is null or s.id = p_servicio_id)
        and (nullif(trim(p_q), '') is null or s.nombre ilike '%' || trim(p_q) || '%'
            or s.descripcion ilike '%' || trim(p_q) || '%')
        and (p_categoria_id is null or s.categoria_id = p_categoria_id)
        and (p_modalidad is null or s.modalidad = p_modalidad)
        and (p_precio_min is null or s.precio_base >= p_precio_min)
        and (p_precio_max is null or s.precio_base <= p_precio_max)
    order by s.creado_en desc, s.id
    limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
$$;

create or replace function public.consultar_locales_catalogo(p_local_id uuid default null)
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
    where l.activo and public.trabajador_puede_publicar(u.id)
        and s.activo and c.activa and s.modalidad = 'TALLER'
        and public.trabajador_certificado_para_categoria(s.trabajador_id, s.categoria_id)
        and (p_local_id is null or l.id = p_local_id)
    group by l.id, u.nombre order by l.nombre, l.id;
$$;

notify pgrst, 'reload schema';
commit;
