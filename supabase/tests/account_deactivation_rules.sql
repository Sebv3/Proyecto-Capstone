-- Disposable PostgreSQL only. All sample data is rolled back.
begin;
insert into public.usuarios(id,nombre,rol,activo,email) values
('91000000-0000-4000-8000-000000000001','Worker to deactivate','TRABAJADOR',true,'deactivate91@example.test'),
('92000000-0000-4000-8000-000000000001','Client to deactivate','CLIENTE',true,'deactivate92@example.test');
insert into public.trabajadores(usuario_id) values ('91000000-0000-4000-8000-000000000001');
insert into public.verificaciones_trabajador values ('91000000-0000-4000-8000-000000000001','APROBADA');
insert into public.clientes values ('91000000-0000-4000-8000-000000000001',
    'Client address retained 123','77777777-7777-4777-8777-777777777777');
insert into public.servicios(id,trabajador_id,categoria_id,nombre,descripcion,precio_base,
    duracion_estimada_minutos,modalidad,ubicacion_publica,latitud,longitud,radio_cobertura_km)
values ('95000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Retained painting','Retained service',20000,60,
    'DOMICILIO','Demo sector',-33.45,-70.66,5);
insert into public.solicitudes(id,servicio_id,cliente_id,trabajador_id,servicio_nombre,
    precio_base,duracion_estimada_minutos,modalidad,inicio_en,fin_en,ubicacion_servicio,
    cliente_nombre,comuna_servicio_id,comuna_servicio_nombre)
values ('96000000-0000-4000-8000-000000000001','95000000-0000-4000-8000-000000000001',
    '92000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001',
    'Retained painting',20000,60,'DOMICILIO',now() + interval '2 days',
    now() + interval '2 days 1 hour','Demo address 123','Client to deactivate',
    '77777777-7777-4777-8777-777777777777','Comuna del servicio');

select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $$ begin
    assert public.desactivar_cuenta_actual();
    assert not public.desactivar_cuenta_actual(); -- idempotent state; no reactivation
    assert not public.trabajador_puede_publicar(auth.uid());
    begin
        perform public.cambiar_modo_cuenta('CLIENTE');
        raise exception 'Inactive worker switched to client';
    exception when insufficient_privilege then null; end;
    begin
        perform public.cambiar_modo_cuenta('TRABAJADOR');
        raise exception 'Inactive worker reactivated';
    exception when insufficient_privilege then null; end;
end; $$;
reset role;
do $$ begin
    assert not (select activo from public.usuarios where id='91000000-0000-4000-8000-000000000001');
    assert (select activo from public.usuarios where id='92000000-0000-4000-8000-000000000001');
    assert exists(select 1 from public.trabajadores where usuario_id='91000000-0000-4000-8000-000000000001');
    assert exists(select 1 from public.clientes where usuario_id='91000000-0000-4000-8000-000000000001');
    assert exists(select 1 from public.servicios where id='95000000-0000-4000-8000-000000000001');
    assert exists(select 1 from public.solicitudes where id='96000000-0000-4000-8000-000000000001');
    assert (select estado from public.verificaciones_trabajador
        where trabajador_id='91000000-0000-4000-8000-000000000001') = 'APROBADA';
end; $$;
select set_config('request.jwt.claim.sub','92000000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $$ begin assert public.desactivar_cuenta_actual(); end; $$;
reset role;
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',true);
set local role authenticated;
do $$ begin assert not public.desactivar_cuenta_actual(); end; $$;
reset role;
set local role anon;
do $$ begin
    begin
        perform public.desactivar_cuenta_actual();
        raise exception 'Anonymous account deactivation succeeded';
    exception when insufficient_privilege then null; end;
end; $$;
reset role;
rollback;
