-- Require and store the phone number supplied during client and worker signup.

create or replace function public.crear_perfil_de_usuario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    rol_solicitado text;
    nombre_solicitado text;
    rut_solicitado text;
    telefono_solicitado text;
    direccion_solicitada text;
    comuna_solicitada uuid;
begin
    rol_solicitado := upper(coalesce(new.raw_user_meta_data ->> 'rol', ''));
    nombre_solicitado := coalesce(
        nullif(trim(new.raw_user_meta_data ->> 'nombre'), ''),
        split_part(coalesce(new.email, ''), '@', 1)
    );
    rut_solicitado := public.normalizar_rut_chileno(
        new.raw_user_meta_data ->> 'rut'
    );
    telefono_solicitado := nullif(trim(new.raw_user_meta_data ->> 'telefono'), '');
    direccion_solicitada := nullif(trim(
        case
            when rol_solicitado = 'TRABAJADOR'
                then new.raw_user_meta_data ->> 'direccion_base'
            else new.raw_user_meta_data ->> 'direccion'
        end
    ), '');

    if rol_solicitado not in ('CLIENTE', 'TRABAJADOR') then
        raise exception 'Debe seleccionar el rol CLIENTE o TRABAJADOR';
    end if;
    if rut_solicitado is null or not public.rut_chileno_valido(rut_solicitado) then
        raise exception 'Debe proporcionar un RUT chileno valido';
    end if;
    if telefono_solicitado is null
       or telefono_solicitado !~ '^[+]?[0-9 ]{8,15}$' then
        raise exception 'Debe proporcionar un telefono valido';
    end if;
    if direccion_solicitada is null
       or char_length(direccion_solicitada) not between 5 and 200 then
        raise exception 'Debe proporcionar una direccion valida';
    end if;

    begin
        comuna_solicitada := (new.raw_user_meta_data ->> 'comuna_id')::uuid;
    exception
        when invalid_text_representation then
            raise exception 'Debe seleccionar una comuna valida';
    end;
    if comuna_solicitada is null
       or not exists (
           select 1 from public.comunas
           where id = comuna_solicitada and activa
       ) then
        raise exception 'Debe seleccionar una comuna activa';
    end if;

    insert into public.usuarios (id, email, nombre, rut, telefono, rol)
    values (
        new.id, new.email, nombre_solicitado, rut_solicitado,
        telefono_solicitado, rol_solicitado::public.usuario_rol
    );

    if rol_solicitado = 'CLIENTE' then
        insert into public.clientes (usuario_id, direccion, comuna_id)
        values (new.id, direccion_solicitada, comuna_solicitada);
    else
        insert into public.trabajadores (usuario_id, direccion_base, comuna_id)
        values (new.id, direccion_solicitada, comuna_solicitada);
    end if;
    return new;
end;
$$;

comment on function public.crear_perfil_de_usuario() is
    'Creates the user with required phone and their client or worker profile atomically during signup.';
