-- Run concurrently with booking_concurrency_a.sql. Exactly one call may succeed.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select * from public.cambiar_estado_solicitud('b4444444-4444-4444-8444-444444444444','PENDIENTE','ACEPTADA');
commit;
