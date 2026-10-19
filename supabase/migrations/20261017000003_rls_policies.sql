-- =============================================================================
-- Row-Level Security policies. Deny by default; each policy grants one thing.
--
--   | Action                                   | admin | designer | operator      | viewer   |
--   |------------------------------------------|-------|----------|---------------|----------|
--   | Read venues/scenes/tasks/photos          | all   | all      | assigned      | assigned |
--   | Create/edit tasks, scenes, props         | yes   | yes      | -             | -        |
--   | Upload scene photos                      | yes   | yes      | assigned      | -        |
--   | Set feasibility result (RPC)             | yes   | yes      | assigned      | -        |
--   | Sessions / episodes via UI               | yes   | yes      | own           | -        |
--   | Users, assignments, rigs, keys, audit    | yes   | -        | -             | -        |
--
-- "admin" always means admin with an aal2 (TOTP-verified) session.
-- =============================================================================

create or replace function private.scene_venue(p_scene_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select venue_id from public.scenes where id = p_scene_id
$$;

create or replace function private.can_log_to_session(p_session_id uuid, p_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.sessions s
      join public.tasks t on t.id = p_task_id
      join public.scenes sc on sc.id = t.scene_id and sc.venue_id = s.venue_id
     where s.id = p_session_id
       and s.ended_at is null
       and private.can_work_venue(s.venue_id)
       and (private.is_staff() or s.operator_id = auth.uid())
  )
$$;

grant execute on function private.scene_venue(uuid) to authenticated;
grant execute on function private.can_log_to_session(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create policy "profiles: read own or any as active user" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select private.app_role()) is not null);

create policy "profiles: admin insert" on public.profiles
  for insert to authenticated with check ((select private.is_admin()));

create policy "profiles: admin update" on public.profiles
  for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

-- ---------------------------------------------------------------------------
-- venues
-- ---------------------------------------------------------------------------
create policy "venues: read visible" on public.venues
  for select to authenticated using (private.can_see_venue(id));

create policy "venues: staff insert" on public.venues
  for insert to authenticated with check ((select private.is_staff()));

create policy "venues: staff update" on public.venues
  for update to authenticated
  using ((select private.is_staff())) with check ((select private.is_staff()));

create policy "venues: admin delete" on public.venues
  for delete to authenticated using ((select private.is_admin()));

-- ---------------------------------------------------------------------------
-- venue_assignments
-- ---------------------------------------------------------------------------
create policy "assignments: read own or admin" on public.venue_assignments
  for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));

create policy "assignments: admin insert" on public.venue_assignments
  for insert to authenticated with check ((select private.is_admin()));

create policy "assignments: admin delete" on public.venue_assignments
  for delete to authenticated using ((select private.is_admin()));

-- ---------------------------------------------------------------------------
-- scenes
-- ---------------------------------------------------------------------------
create policy "scenes: read visible" on public.scenes
  for select to authenticated using (private.can_see_venue(venue_id));

create policy "scenes: staff insert" on public.scenes
  for insert to authenticated with check ((select private.is_staff()));

create policy "scenes: staff update" on public.scenes
  for update to authenticated
  using ((select private.is_staff())) with check ((select private.is_staff()));

create policy "scenes: admin delete" on public.scenes
  for delete to authenticated using ((select private.is_admin()));

-- ---------------------------------------------------------------------------
-- scene_photos
-- ---------------------------------------------------------------------------
create policy "photos: read visible" on public.scene_photos
  for select to authenticated using (private.can_see_scene(scene_id));

create policy "photos: upload to workable venue" on public.scene_photos
  for insert to authenticated
  with check (
    uploaded_by = (select auth.uid())
    and private.can_work_venue(private.scene_venue(scene_id))
  );

create policy "photos: staff update" on public.scene_photos
  for update to authenticated
  using ((select private.is_staff())) with check ((select private.is_staff()));

create policy "photos: staff or uploader delete" on public.scene_photos
  for delete to authenticated
  using (
    (select private.is_staff())
    or (uploaded_by = (select auth.uid()) and private.can_work_venue(private.scene_venue(scene_id)))
  );

-- ---------------------------------------------------------------------------
-- tasks & versions
-- ---------------------------------------------------------------------------
create policy "tasks: read visible" on public.tasks
  for select to authenticated using (private.can_see_scene(scene_id));

create policy "tasks: staff insert" on public.tasks
  for insert to authenticated with check ((select private.is_staff()));

create policy "tasks: staff update" on public.tasks
  for update to authenticated
  using ((select private.is_staff())) with check ((select private.is_staff()));

create policy "tasks: admin delete" on public.tasks
  for delete to authenticated using ((select private.is_admin()));

create policy "task_versions: read visible" on public.task_versions
  for select to authenticated using (private.can_see_task(task_id));

-- ---------------------------------------------------------------------------
-- props & task_props
-- ---------------------------------------------------------------------------
create policy "props: read as active user" on public.props
  for select to authenticated using ((select private.app_role()) is not null);

create policy "props: staff insert" on public.props
  for insert to authenticated with check ((select private.is_staff()));

create policy "props: staff update" on public.props
  for update to authenticated
  using ((select private.is_staff())) with check ((select private.is_staff()));

create policy "props: admin delete" on public.props
  for delete to authenticated using ((select private.is_admin()));

create policy "task_props: read visible" on public.task_props
  for select to authenticated using (private.can_see_task(task_id));

create policy "task_props: staff insert" on public.task_props
  for insert to authenticated with check ((select private.is_staff()));

create policy "task_props: staff update" on public.task_props
  for update to authenticated
  using ((select private.is_staff())) with check ((select private.is_staff()));

create policy "task_props: staff delete" on public.task_props
  for delete to authenticated using ((select private.is_staff()));

-- ---------------------------------------------------------------------------
-- rigs & api_keys
-- ---------------------------------------------------------------------------
create policy "rigs: read as active user" on public.rigs
  for select to authenticated using ((select private.app_role()) is not null);

create policy "rigs: admin insert" on public.rigs
  for insert to authenticated with check ((select private.is_admin()));

create policy "rigs: admin update" on public.rigs
  for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy "api_keys: admin read" on public.api_keys
  for select to authenticated using ((select private.is_admin()));

create policy "api_keys: admin insert" on public.api_keys
  for insert to authenticated with check ((select private.is_admin()));

create policy "api_keys: admin update" on public.api_keys
  for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

-- ---------------------------------------------------------------------------
-- sessions & episodes
-- ---------------------------------------------------------------------------
create policy "sessions: read visible venue" on public.sessions
  for select to authenticated using (private.can_see_venue(venue_id));

create policy "sessions: start own" on public.sessions
  for insert to authenticated
  with check (operator_id = (select auth.uid()) and private.can_work_venue(venue_id));

create policy "sessions: update own or staff" on public.sessions
  for update to authenticated
  using ((select private.is_staff()) or operator_id = (select auth.uid()))
  with check ((select private.is_staff()) or operator_id = (select auth.uid()));

create policy "episodes: read visible" on public.episodes
  for select to authenticated using (private.can_see_task(task_id));

create policy "episodes: log to own open session" on public.episodes
  for insert to authenticated
  with check (private.can_log_to_session(session_id, task_id));

create policy "episodes: undo in own open session" on public.episodes
  for delete to authenticated
  using (private.can_log_to_session(session_id, task_id));

create policy "episodes: staff update" on public.episodes
  for update to authenticated
  using ((select private.is_staff())) with check ((select private.is_staff()));

-- ---------------------------------------------------------------------------
-- audit_log: admin read-only; rows are written by security-definer triggers.
-- ---------------------------------------------------------------------------
create policy "audit_log: admin read" on public.audit_log
  for select to authenticated using ((select private.is_admin()));

revoke insert, update, delete, truncate on public.audit_log from authenticated;
revoke insert, update, delete, truncate on public.task_versions from authenticated;

-- =============================================================================
-- RPCs
-- =============================================================================

-- Operators record a feasibility result on tasks in their venues.
create or replace function public.set_task_feasibility(
  p_task_id uuid,
  p_result public.task_status,
  p_notes text default null
)
returns public.tasks
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task public.tasks;
  v_venue uuid;
begin
  if p_result not in ('feasible', 'needs_change', 'infeasible') then
    raise exception 'Feasibility result must be feasible, needs_change or infeasible'
      using errcode = '22023';
  end if;

  select t.* into v_task from public.tasks t where t.id = p_task_id for update;
  if not found then
    raise exception 'Task not found' using errcode = 'P0002';
  end if;
  v_venue := private.scene_venue(v_task.scene_id);

  if not private.can_work_venue(v_venue) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if not private.is_staff() and v_task.status <> 'feasibility_test' then
    raise exception 'Task is not in feasibility testing' using errcode = '22023';
  end if;

  update public.tasks
     set status = p_result,
         feasibility_notes = coalesce(nullif(trim(p_notes), ''), feasibility_notes)
   where id = p_task_id
  returning * into v_task;
  return v_task;
end;
$$;

revoke execute on function public.set_task_feasibility(uuid, public.task_status, text) from public, anon;
grant execute on function public.set_task_feasibility(uuid, public.task_status, text) to authenticated;

-- Duplicate-task warning. Invoker rights: callers only see tasks RLS allows.
create or replace function public.similar_tasks(
  p_query text,
  p_threshold real default 0.5,
  p_exclude uuid default null
)
returns table (id uuid, code text, instruction text, status public.task_status, similarity real)
language sql
stable
set search_path = ''
as $$
  select t.id, t.code, t.instruction, t.status,
         extensions.similarity(lower(t.instruction), lower(p_query)) as similarity
    from public.tasks t
   where not t.archived
     and (p_exclude is null or t.id <> p_exclude)
     and extensions.similarity(lower(t.instruction), lower(p_query)) > p_threshold
   order by similarity desc
   limit 5
$$;

revoke execute on function public.similar_tasks(text, real, uuid) from public, anon;
grant execute on function public.similar_tasks(text, real, uuid) to authenticated;

-- Fixed-window per-key rate limit for /api/v1. Returns true when allowed.
create or replace function public.api_rate_limit_hit(
  p_key_id uuid,
  p_limit integer default 60,
  p_window_seconds integer default 60
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window timestamptz :=
    to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_hits integer;
begin
  insert into private.api_rate_limits as r (key_id, window_start, hits)
  values (p_key_id, v_window, 1)
  on conflict (key_id, window_start) do update set hits = r.hits + 1
  returning hits into v_hits;

  -- Opportunistic cleanup of old windows.
  if random() < 0.01 then
    delete from private.api_rate_limits where window_start < now() - interval '1 hour';
  end if;

  return v_hits <= p_limit;
end;
$$;

revoke execute on function public.api_rate_limit_hit(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.api_rate_limit_hit(uuid, integer, integer) to service_role;

-- =============================================================================
-- Storage: private bucket; no client policies (all access via server code).
-- =============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('scene-photos', 'scene-photos', false, 15728640, array['image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- =============================================================================
-- Realtime: dashboard and operator mode listen for episode inserts.
-- Realtime applies the SELECT policies above per subscriber.
-- =============================================================================
alter publication supabase_realtime add table public.episodes;
alter publication supabase_realtime add table public.tasks;
