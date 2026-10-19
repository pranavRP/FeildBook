-- Revokes every session and refresh token for a user (used on deactivation).
-- Security definer because auth.* is not client-accessible; the caller must be an aal2 admin.
create or replace function public.admin_revoke_sessions(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if not private.is_admin() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  delete from auth.refresh_tokens where user_id = p_user_id::text;
  delete from auth.sessions where user_id = p_user_id;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.admin_revoke_sessions(uuid) from public, anon;
grant execute on function public.admin_revoke_sessions(uuid) to authenticated;

-- Episodes per day for the dashboard chart. Invoker rights: RLS limits rows.
create or replace function public.dashboard_daily(p_days integer default 14, p_tz text default 'UTC')
returns table (day date, success integer, failure integer, aborted integer)
language sql
stable
set search_path = ''
as $$
  with days as (
    select generate_series(
      (now() at time zone p_tz)::date - (p_days - 1),
      (now() at time zone p_tz)::date,
      interval '1 day'
    )::date as day
  )
  select d.day,
         count(e.id) filter (where e.outcome = 'success')::int,
         count(e.id) filter (where e.outcome = 'failure')::int,
         count(e.id) filter (where e.outcome = 'aborted')::int
    from days d
    left join public.episodes e
      on (e.created_at at time zone p_tz)::date = d.day
   group by d.day
   order by d.day
$$;

revoke execute on function public.dashboard_daily(integer, text) from public, anon;
grant execute on function public.dashboard_daily(integer, text) to authenticated;
