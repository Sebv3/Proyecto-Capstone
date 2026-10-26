begin;

-- Production application flow uses Mercado Pago TEST, not a client-triggered
-- simulated receipt. Keep historical functions/data without exposing the bypass.
revoke all on function public.simular_pago_solicitud(uuid) from public, anon, authenticated;
revoke all on function public.simular_pago_solicitud_sin_checkout(uuid)
    from public, anon, authenticated;

notify pgrst, 'reload schema';
commit;
