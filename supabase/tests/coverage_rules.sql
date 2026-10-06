-- Disposable DB only: run fixture, certifications migration, coverage migration, then this file.
insert into public.locales(id,trabajador_id,nombre,direccion_publica,latitud,longitud) values
('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','11111111-1111-4111-8111-111111111111','Taller Central','Avenida Central 123',-33.45,-70.66);
insert into public.servicios(trabajador_id,categoria_id,nombre,descripcion,precio_base,duracion_estimada_minutos,modalidad)
values ('11111111-1111-4111-8111-111111111111','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Pintura','Pintura en taller',20000,60,'DOMICILIO');
set role anon;
do $$ begin
    if exists(select 1 from public.locales) or exists(select 1 from public.consultar_locales_catalogo()) then
        raise exception 'A domicilio-only location was exposed';
    end if;
end; $$;
reset role;
update public.servicios set modalidad='TALLER' where nombre='Pintura';
set role anon;
do $$ begin
    if (select count(*) from public.locales) <> 1 then raise exception 'Visible location missing in RLS'; end if;
    if (select count(*) from public.consultar_locales_catalogo()) <> 1 then raise exception 'Visible location missing in RPC'; end if;
    if (select jsonb_array_length(servicios) from public.consultar_locales_catalogo()) <> 1 then raise exception 'Incorrect services'; end if;
    if exists(select 1 from public.consultar_locales_catalogo('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')) then raise exception 'ID filter ignored'; end if;
end; $$;
reset role;
-- Old uncertified offers must not enter the map either.
alter table public.servicios disable trigger servicios_validar_publicacion;
update public.servicios set modalidad='TALLER' where nombre='Old service';
alter table public.servicios enable trigger servicios_validar_publicacion;
do $$ begin
    if (select jsonb_array_length(servicios) from public.consultar_locales_catalogo()) <> 1 then raise exception 'Uncertified service exposed'; end if;
end; $$;
update public.usuarios set activo=false where id='11111111-1111-4111-8111-111111111111';
set role anon;
do $$ begin
    if exists(select 1 from public.locales) or exists(select 1 from public.consultar_locales_catalogo()) then raise exception 'Inactive worker exposed'; end if;
end; $$;
reset role;
update public.usuarios set activo=true where id='11111111-1111-4111-8111-111111111111';
update public.verificaciones_trabajador set estado='RECHAZADA';
do $$ begin
    if exists(select 1 from public.consultar_locales_catalogo()) then raise exception 'Unapproved worker exposed'; end if;
end; $$;
update public.verificaciones_trabajador set estado='APROBADA';
update public.locales set activo=false;
set role authenticated;
do $$ begin
    if exists(select 1 from public.locales) or exists(select 1 from public.consultar_locales_catalogo()) then raise exception 'Inactive local exposed'; end if;
    begin
        update public.locales set activo=true;
        raise exception 'Client modified location';
    exception when insufficient_privilege then null; end;
end; $$;
reset role;
select 'Coverage visibility and permissions passed' as result;
