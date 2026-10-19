-- Atomically replaces a task's props. Invoker rights: RLS (staff only) applies.
-- p_props: [{ "name": "Red bin", "qty": 1, "source": "at_scene", "acquired": false }, ...]
create or replace function public.save_task_props(p_task_id uuid, p_props jsonb)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if jsonb_typeof(p_props) <> 'array' then
    raise exception 'p_props must be an array' using errcode = '22023';
  end if;

  -- Create any props that don't exist yet (names are unique case-insensitively).
  insert into public.props (name)
  select distinct on (lower(trim(x ->> 'name'))) trim(x ->> 'name')
    from jsonb_array_elements(p_props) x
   where coalesce(trim(x ->> 'name'), '') <> ''
  on conflict ((lower(name))) do nothing;

  with wanted as (
    select distinct on (p.id)
           p.id as prop_id,
           greatest(coalesce((x ->> 'qty')::int, 1), 1) as qty,
           coalesce(x ->> 'source', 'at_scene')::public.prop_source as source,
           coalesce((x ->> 'acquired')::boolean, false) as acquired
      from jsonb_array_elements(p_props) x
      join public.props p on lower(p.name) = lower(trim(x ->> 'name'))
  ),
  removed as (
    delete from public.task_props tp
     where tp.task_id = p_task_id
       and tp.prop_id not in (select prop_id from wanted)
  )
  insert into public.task_props (task_id, prop_id, qty, source, acquired)
  select p_task_id, prop_id, qty, source, acquired from wanted
  on conflict (task_id, prop_id) do update
    set qty = excluded.qty,
        source = excluded.source,
        acquired = excluded.acquired
  where (public.task_props.qty, public.task_props.source, public.task_props.acquired)
        is distinct from (excluded.qty, excluded.source, excluded.acquired);
end;
$$;

revoke execute on function public.save_task_props(uuid, jsonb) from public, anon;
grant execute on function public.save_task_props(uuid, jsonb) to authenticated;
