-- Run only in the disposable database after account_modes_fixture + migration.
begin;
insert into public.usuarios(id,nombre,rol,activo,email) values
('91000000-0000-4000-8000-000000000001','Worker born as worker','TRABAJADOR',true,'worker91@example.test'),
('92000000-0000-4000-8000-000000000001','Client never approved','CLIENTE',true,'client92@example.test'),
('93000000-0000-4000-8000-000000000001','Pending worker','CLIENTE',true,'worker93@example.test'),
('94000000-0000-4000-8000-000000000001','Inactive worker','TRABAJADOR',false,'worker94@example.test');
insert into public.trabajadores(usuario_id) values
('91000000-0000-4000-8000-000000000001'), ('93000000-0000-4000-8000-000000000001');
insert into public.verificaciones_trabajador values
('91000000-0000-4000-8000-000000000001','APROBADA'),
('93000000-0000-4000-8000-000000000001','PENDIENTE');
insert into public.servicios(id,trabajador_id,categoria_id,nombre,descripcion,precio_base,
    duracion_estimada_minutos,modalidad,ubicacion_publica,latitud,longitud,radio_cobertura_km)
values ('95000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Mode test painting','Mode test service',20000,60,
    'DOMICILIO','Demo sector',-33.45,-70.66,5);

select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $$ declare state jsonb; begin
    state := public.consultar_modos_cuenta();
    assert state->>'rol_activo' = 'TRABAJADOR';
    assert (state->>'puede_ser_trabajador')::boolean;
    assert not (state->>'perfil_cliente_completo')::boolean;
    perform public.cambiar_modo_cuenta('CLIENTE');
    perform public.cambiar_modo_cuenta('CLIENTE'); -- retries never toggle back
    assert (public.consultar_modos_cuenta()->>'rol_activo') = 'CLIENTE';
    assert public.trabajador_puede_publicar(auth.uid());
    assert exists(select 1 from public.buscar_servicios_catalogo(
        p_servicio_id => '95000000-0000-4000-8000-000000000001'));
    -- Completing a client profile is independent of worker approval.
    insert into public.clientes values (auth.uid(),'New client address 123',
        '77777777-7777-4777-8777-777777777777');
    assert (public.consultar_modos_cuenta()->>'perfil_cliente_completo')::boolean;
    perform public.cambiar_modo_cuenta('TRABAJADOR');
    perform public.cambiar_modo_cuenta('CLIENTE');
    perform public.cambiar_modo_cuenta('TRABAJADOR');
    assert (public.consultar_modos_cuenta()->>'rol_activo') = 'TRABAJADOR';
    assert (select count(*) from public.clientes where usuario_id=auth.uid()) = 1;
    assert (select count(*) from public.trabajadores where usuario_id=auth.uid()) = 1;
    assert (select estado from public.verificaciones_trabajador where trabajador_id=auth.uid()) = 'APROBADA';
    begin
        perform public.cambiar_modo_cuenta('ADMIN');
        raise exception 'ADMIN escalation succeeded';
    exception when invalid_parameter_value then null; end;
    begin
        update public.usuarios set rol='ADMIN' where id=auth.uid();
        raise exception 'Direct role update succeeded';
    exception when insufficient_privilege then null; end;
end; $$;

-- Public visibility must survive the menu change, but not a revoked approval.
select public.cambiar_modo_cuenta('CLIENTE');
reset role;
set local role anon;
do $$ begin
    assert exists(select 1 from public.buscar_servicios_catalogo(
        p_servicio_id => '95000000-0000-4000-8000-000000000001'));
    begin
        perform public.cambiar_modo_cuenta('TRABAJADOR');
        raise exception 'Anonymous mode switch succeeded';
    exception when insufficient_privilege then null; end;
end; $$;
reset role;
update public.verificaciones_trabajador set estado='RECHAZADA'
where trabajador_id='91000000-0000-4000-8000-000000000001';
set local role authenticated;
do $$ begin
    assert not public.trabajador_puede_publicar(auth.uid());
    assert not (public.consultar_modos_cuenta()->>'puede_ser_trabajador')::boolean;
    begin
        perform public.cambiar_modo_cuenta('TRABAJADOR');
        raise exception 'Revoked worker reactivated';
    exception when insufficient_privilege then null; end;
end; $$;
reset role;

-- First-time and pending accounts need genuine administrative approval.
select set_config('request.jwt.claim.sub','92000000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $$ begin
    assert not (public.consultar_modos_cuenta()->>'puede_ser_trabajador')::boolean;
    begin
        perform public.cambiar_modo_cuenta('TRABAJADOR');
        raise exception 'First-time client bypassed documents';
    exception when insufficient_privilege then null; end;
end; $$;
reset role;
select set_config('request.jwt.claim.sub','93000000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $$ begin
    begin
        perform public.cambiar_modo_cuenta('TRABAJADOR');
        raise exception 'Pending verification bypassed review';
    exception when insufficient_privilege then null; end;
end; $$;
reset role;
select set_config('request.jwt.claim.sub','94000000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $$ begin
    begin
        perform public.cambiar_modo_cuenta('CLIENTE');
        raise exception 'Inactive account switched mode';
    exception when insufficient_privilege then null; end;
end; $$;
reset role;
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',true);
set local role authenticated;
do $$ begin
    begin
        perform public.cambiar_modo_cuenta('CLIENTE');
        raise exception 'Administrator switched mode';
    exception when insufficient_privilege then null; end;
end; $$;
reset role;
rollback;
