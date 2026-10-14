-- Disposable integration DB only: complete workshop fixture after its new migration.
update public.servicios set comuna_taller_id='77777777-7777-4777-8777-777777777777'
where id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
