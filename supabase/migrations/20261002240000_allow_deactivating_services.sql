-- An inactive category must not prevent its existing services from being disabled.

create or replace function public.validar_publicacion_servicio()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if new.activo and not exists (
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
