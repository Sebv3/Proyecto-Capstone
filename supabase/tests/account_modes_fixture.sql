-- ONLY the disposable Sprint 4 fixture, never shared Supabase.
-- The reduced fixture predates real enum/client tables; add their contracts here.
create type public.usuario_rol as enum ('CLIENTE', 'TRABAJADOR', 'ADMIN');
create table public.clientes (
    usuario_id uuid primary key references public.usuarios(id),
    direccion text not null check (char_length(trim(direccion)) between 5 and 200),
    comuna_id uuid not null references public.comunas(id)
);
alter table public.clientes enable row level security;
grant select, insert on public.clientes to authenticated;
create policy clientes_lectura on public.clientes for select to authenticated
using (usuario_id = auth.uid());
create policy clientes_creacion on public.clientes for insert to authenticated
with check (usuario_id = auth.uid() and exists (
    select 1 from public.usuarios where id = auth.uid() and activo and rol = 'CLIENTE'
));
grant update(nombre) on public.usuarios to authenticated;
grant select on public.trabajadores, public.verificaciones_trabajador to authenticated;
