-- ONLY isolated PostgreSQL: Supabase already provides this role remotely.
do $$ begin
    if not exists(select 1 from pg_roles where rolname='service_role') then
        create role service_role bypassrls;
    end if;
end; $$;
