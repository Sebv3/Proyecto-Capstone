do $$ begin
    if (select count(*) from public.solicitudes where estado='ACEPTADA'
        and id in ('a4444444-4444-4444-8444-444444444444','b4444444-4444-4444-8444-444444444444'))<>1
        or (select count(*) from public.solicitudes where estado='RECHAZADA'
        and id in ('a4444444-4444-4444-8444-444444444444','b4444444-4444-4444-8444-444444444444'))<>1 then
        raise exception 'Concurrent acceptance did not leave exactly one accepted and one rejected';
    end if;
end; $$;
select 'Concurrent overlapping acceptances: exactly one reservation confirmed' as result;
