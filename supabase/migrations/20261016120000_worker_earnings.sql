-- SCRUM-59: read-only simulated earnings, scoped to the authenticated worker.
begin;
create function public.consultar_ganancias_trabajador(
    p_mes date, p_limit integer default 20, p_offset integer default 0
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb; month_end date;
begin
    if auth.uid() is null or not exists (
        select 1 from public.usuarios where id = auth.uid() and activo and rol = 'TRABAJADOR'
    ) then raise exception 'Operacion no permitida' using errcode = '42501'; end if;
    if p_mes is null or extract(day from p_mes) <> 1
        or p_mes < date '2000-01-01' or p_mes > date '2100-12-01'
        or p_limit is null or p_limit not between 1 and 100
        or p_offset is null or p_offset < 0 then
        raise exception 'Periodo o paginacion invalida' using errcode = '22023';
    end if;
    month_end := (p_mes + interval '1 month')::date;
    -- COMPLETADA is terminal: actualizado_en is the recorded completion timestamp.
    -- Open paid services belong to their scheduled month, not the payment month.
    with own as (
        select s.id as solicitud_id, s.servicio_nombre, s.estado,
            p.tarifa_base as monto, s.estado = 'COMPLETADA' as completada,
            case when s.estado = 'COMPLETADA' then s.actualizado_en else s.inicio_en end as fecha
        from public.solicitudes s join public.pagos p on p.solicitud_id = s.id
        where s.trabajador_id = auth.uid() and p.trabajador_id = auth.uid()
            and p.cliente_id = s.cliente_id and p.estado = 'APROBADO' and p.simulado
            and s.estado in ('PAGADA','EN_CAMINO','EN_CURSO','LISTO','COMPLETADA')
    ), selected as (
        select * from own where (fecha at time zone 'America/Santiago')::date >= p_mes
            and (fecha at time zone 'America/Santiago')::date < month_end
    ), daily as (
        select d::date as fecha, coalesce(sum(s.monto),0) as monto
        from generate_series(p_mes::timestamp, (month_end - 1)::timestamp, interval '1 day') d
        left join selected s on s.completada and (s.fecha at time zone 'America/Santiago')::date = d::date
        group by d
    ), page as (
        select solicitud_id, servicio_nombre, estado, monto, fecha, completada
        from selected order by fecha desc, solicitud_id desc limit p_limit offset p_offset
    )
    select jsonb_build_object(
        'mes', to_char(p_mes,'YYYY-MM'), 'moneda','CLP','simulado',true,
        'total_completado',coalesce((select sum(monto) from selected where completada),0),
        'cantidad_completada',(select count(*) from selected where completada),
        'total_en_curso',coalesce((select sum(monto) from selected where not completada),0),
        'cantidad_en_curso',(select count(*) from selected where not completada),
        'dias',(select jsonb_agg(to_jsonb(daily) order by fecha) from daily),
        'items',coalesce((select jsonb_agg(to_jsonb(page) order by fecha desc, solicitud_id desc) from page),'[]'::jsonb),
        'limit',p_limit,'offset',p_offset,'has_more',(select count(*) from selected)>p_offset::bigint+p_limit
    ) into result;
    return result;
end; $$;
revoke all on function public.consultar_ganancias_trabajador(date,integer,integer) from public, anon;
grant execute on function public.consultar_ganancias_trabajador(date,integer,integer) to authenticated;
notify pgrst, 'reload schema';
commit;
