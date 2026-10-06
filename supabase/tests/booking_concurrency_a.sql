-- Run concurrently with booking_concurrency_b.sql after concurrency_setup.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select * from public.cambiar_estado_solicitud('a4444444-4444-4444-8444-444444444444','PENDIENTE','ACEPTADA');
select pg_sleep(0.5);
commit;
