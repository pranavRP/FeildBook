-- =============================================================================
-- Helper functions (private schema) and triggers.
-- =============================================================================

grant usage on schema private to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Role helpers used by RLS policies.
-- An admin without a 2FA-verified session (aal2) has no privileges at all.
-- ---------------------------------------------------------------------------
create or replace function private.app_role()
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select case
           when p.role = 'admin'
                and coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal2' then null
           else p.role
         end
  from public.profiles p
  where p.id = auth.uid()
    and p.active
$$;

create or replace function private.is_admin()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(private.app_role() = 'admin', false)
$$;

create or replace function private.is_staff()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(private.app_role() in ('admin', 'designer'), false)
$$;

create or replace function private.can_see_venue(p_venue_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case private.app_role()
           when 'admin' then true
           when 'designer' then true
           when 'operator' then exists (
             select 1 from public.venue_assignments va
             where va.venue_id = p_venue_id and va.user_id = auth.uid())
           when 'viewer' then exists (
             select 1 from public.venue_assignments va
             where va.venue_id = p_venue_id and va.user_id = auth.uid())
           else false
         end
$$;

create or replace function private.can_see_scene(p_scene_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select private.can_see_venue(s.venue_id) from public.scenes s where s.id = p_scene_id),
    false)
$$;

create or replace function private.can_see_task(p_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select private.can_see_venue(s.venue_id)
       from public.tasks t join public.scenes s on s.id = t.scene_id
      where t.id = p_task_id),
    false)
$$;

-- Operators may upload photos and log work only for venues assigned to them.
create or replace function private.can_work_venue(p_venue_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select private.is_staff()
      or (private.app_role() = 'operator' and private.can_see_venue(p_venue_id))
$$;

grant execute on all functions in schema private to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['profiles','venues','scenes','tasks','props','task_props','rigs','sessions']
  loop
    execute format(
      'create trigger set_updated_at before update on public.%I
         for each row execute function private.set_updated_at()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- New auth user -> profile. Role comes from invite metadata (set server-side
-- with the service-role key); anything unrecognised falls back to viewer.
-- ---------------------------------------------------------------------------
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.user_role := 'viewer';
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  if v_meta ->> 'role' in ('admin', 'designer', 'operator', 'viewer') then
    v_role := (v_meta ->> 'role')::public.user_role;
  end if;

  insert into public.profiles (id, email, full_name, role, is_contractor)
  values (
    new.id,
    new.email,
    nullif(trim(v_meta ->> 'full_name'), ''),
    v_role,
    coalesce((v_meta ->> 'is_contractor')::boolean, false)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------------
-- Tasks: version history + automatic status changes.
-- ---------------------------------------------------------------------------
create or replace function private.tasks_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.created_by := coalesce(new.created_by, auth.uid());
  new.current_version := 1;
  insert into public.task_versions (task_id, version, instruction, change_reason, changed_by)
  values (new.id, 1, new.instruction,
          coalesce(nullif(trim(new.version_change_reason), ''), 'Created'), new.created_by);
  new.version_change_reason := null;
  return new;
end;
$$;

create or replace function private.tasks_before_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- New instruction => new version with the reason passed in by the caller.
  if new.instruction is distinct from old.instruction then
    new.current_version := old.current_version + 1;
    insert into public.task_versions (task_id, version, instruction, change_reason, changed_by)
    values (new.id, new.current_version, new.instruction,
            nullif(trim(new.version_change_reason), ''), auth.uid());
    -- needs_change -> (new version) -> feasibility_test
    if old.status = 'needs_change' and new.status = old.status then
      new.status := 'feasibility_test';
    end if;
  end if;
  new.version_change_reason := null;

  -- Progress-driven status changes (only when the counters/target moved).
  if new.success_count is distinct from old.success_count
     or new.episode_count is distinct from old.episode_count
     or new.target_episodes is distinct from old.target_episodes then
    if new.success_count >= new.target_episodes and new.status in ('ready', 'collecting') then
      new.status := 'done';
    elsif new.status = 'done' and new.success_count < new.target_episodes then
      new.status := 'collecting';
    elsif new.status = 'ready' and new.episode_count > 0 then
      new.status := 'collecting';
    end if;
  end if;

  return new;
end;
$$;

create trigger tasks_before_insert
  before insert on public.tasks
  for each row execute function private.tasks_before_insert();

create trigger tasks_before_update
  before update on public.tasks
  for each row execute function private.tasks_before_update();

-- ---------------------------------------------------------------------------
-- Episodes: stamp task version, keep task counters in sync.
-- ---------------------------------------------------------------------------
create or replace function private.episodes_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.task_version is null then
    select t.current_version into new.task_version from public.tasks t where t.id = new.task_id;
  end if;
  return new;
end;
$$;

create or replace function private.recount_task(p_task_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.tasks t
     set success_count = c.successes,
         episode_count = c.total
    from (
      select count(*) filter (where e.outcome = 'success')::int as successes,
             count(*)::int as total
        from public.episodes e
       where e.task_id = p_task_id
    ) c
   where t.id = p_task_id
     and (t.success_count, t.episode_count) is distinct from (c.successes, c.total);
$$;

create or replace function private.episodes_after_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    perform private.recount_task(new.task_id);
  end if;
  if tg_op in ('DELETE', 'UPDATE') and (tg_op = 'DELETE' or old.task_id <> new.task_id) then
    perform private.recount_task(old.task_id);
  end if;
  return null;
end;
$$;

create trigger episodes_before_insert
  before insert on public.episodes
  for each row execute function private.episodes_before_insert();

create trigger episodes_after_change
  after insert or update or delete on public.episodes
  for each row execute function private.episodes_after_change();

-- ---------------------------------------------------------------------------
-- Audit log on every write to business tables.
-- ---------------------------------------------------------------------------
create or replace function private.audit_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_ignore text[] := array['updated_at', 'success_count', 'episode_count', 'last_used_at',
                           'version_change_reason'];
  v_redact text[] := array['key_hash'];
  v_diff jsonb;
  v_row_id text;
begin
  v_row_id := coalesce(
    v_row ->> 'id',
    concat_ws(':', v_row ->> 'task_id', v_row ->> 'venue_id', v_row ->> 'prop_id', v_row ->> 'user_id'));

  if tg_op = 'UPDATE' then
    select jsonb_object_agg(o.key, jsonb_build_object('old', o.value, 'new', n.value))
      into v_diff
      from jsonb_each(v_old) o
      join jsonb_each(v_new) n using (key)
     where o.value is distinct from n.value
       and not (o.key = any (v_ignore));
    if v_diff is null then
      return null; -- only bookkeeping columns changed
    end if;
  elsif tg_op = 'INSERT' then
    v_diff := v_new - v_redact;
  else
    v_diff := v_old - v_redact;
  end if;

  insert into public.audit_log (actor_id, action, table_name, row_id, diff)
  values (auth.uid(), lower(tg_op), tg_table_name, v_row_id, v_diff);
  return null;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['profiles','venues','venue_assignments','scenes','scene_photos',
                           'tasks','props','task_props','rigs','api_keys','sessions','episodes']
  loop
    execute format(
      'create trigger audit_row after insert or update or delete on public.%I
         for each row execute function private.audit_row()', t);
  end loop;
end $$;
