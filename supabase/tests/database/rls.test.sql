-- RLS policy tests. Run with: pnpm test:rls  (supabase test db)
begin;
create extension if not exists pgtap with schema extensions;
select plan(37);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres): two venues, one assigned to the operator & viewer.
-- ---------------------------------------------------------------------------
-- Roles come from app_metadata (server-set). The last user tries to pick a role via
-- user metadata, which anyone can do with signUp(): it must be ignored.
insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', 'rls-admin@test.local',    'authenticated', 'authenticated', '{"role":"admin"}',     '{}'),
  ('00000000-0000-0000-0000-0000000000d1', 'rls-designer@test.local', 'authenticated', 'authenticated', '{"role":"designer"}',  '{}'),
  ('00000000-0000-0000-0000-00000000000c', 'rls-operator@test.local', 'authenticated', 'authenticated', '{"role":"operator"}',  '{}'),
  ('00000000-0000-0000-0000-0000000000b1', 'rls-viewer@test.local',   'authenticated', 'authenticated', '{"role":"viewer"}',    '{}'),
  ('00000000-0000-0000-0000-0000000000e1', 'rls-gone@test.local',     'authenticated', 'authenticated', '{"role":"designer"}',  '{}'),
  ('00000000-0000-0000-0000-0000000000f1', 'rls-signup@test.local',   'authenticated', 'authenticated', '{"provider":"email"}', '{"role":"admin","full_name":"Sneaky"}');

update public.profiles set active = false where id = '00000000-0000-0000-0000-0000000000e1';

insert into public.venues (id, name) values
  ('10000000-0000-0000-0000-00000000000a', 'RLS Venue A'),
  ('10000000-0000-0000-0000-00000000000b', 'RLS Venue B');
insert into public.venue_assignments (venue_id, user_id) values
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000c'),
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000b1');
insert into public.scenes (id, venue_id, name) values
  ('20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000a', 'Scene A'),
  ('20000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-00000000000b', 'Scene B');
insert into public.tasks (id, scene_id, instruction, status) values
  ('30000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'RLS task in A', 'feasibility_test'),
  ('30000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b', 'RLS task in B', 'feasibility_test');
insert into public.scene_photos (scene_id, storage_path, thumb_path) values
  ('20000000-0000-0000-0000-00000000000a', 'rls/a.jpg', 'rls/a_t.webp'),
  ('20000000-0000-0000-0000-00000000000b', 'rls/b.jpg', 'rls/b_t.webp');
insert into public.rigs (id, name) values ('40000000-0000-0000-0000-000000000001', 'RLS Rig');
insert into public.api_keys (rig_id, prefix, key_hash)
  values ('40000000-0000-0000-0000-000000000001', 'rlstest1', repeat('a', 64));

-- Runs a statement and returns the number of rows it touched.
create function pg_temp.rows_affected(q text) returns int
language plpgsql as $$
declare n int;
begin
  execute q;
  get diagnostics n = row_count;
  return n;
end $$;

-- Impersonate a user: JWT claims + the authenticated role.
create function pg_temp.act_as(p_uid uuid, p_aal text default 'aal1') returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated', 'aal', p_aal)::text, true);
  execute 'set local role authenticated';
end $$;

-- ---------------------------------------------------------------------------
-- Profiles from invite metadata
-- ---------------------------------------------------------------------------
select is((select role::text from public.profiles where id = '00000000-0000-0000-0000-00000000000c'),
          'operator', 'app_metadata sets the profile role');
select is((select role::text from public.profiles where id = '00000000-0000-0000-0000-0000000000f1'),
          'viewer', 'self-signup cannot choose a role via user metadata');

-- ---------------------------------------------------------------------------
-- Operator: assigned venue only
-- ---------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-00000000000c');

select is((select count(*)::int from public.tasks where scene_id = '20000000-0000-0000-0000-00000000000a'),
          1, 'operator reads tasks in assigned venue');
select is((select count(*)::int from public.tasks where id = '30000000-0000-0000-0000-00000000000b'),
          0, 'operator cannot read tasks in unassigned venue');
select is((select count(*)::int from public.scene_photos where storage_path = 'rls/b.jpg'),
          0, 'operator cannot read photos in unassigned venue');
select is((select count(*)::int from public.scenes where id = '20000000-0000-0000-0000-00000000000b'),
          0, 'operator cannot read scenes in unassigned venue');
select is((select count(*)::int from public.venues where id = '10000000-0000-0000-0000-00000000000b'),
          0, 'operator cannot read unassigned venue');
select is((select count(*)::int from public.task_versions where task_id = '30000000-0000-0000-0000-00000000000b'),
          0, 'operator cannot read version history in unassigned venue');

select throws_ok(
  $$insert into public.tasks (scene_id, instruction) values ('20000000-0000-0000-0000-00000000000a', 'x')$$,
  '42501', null, 'operator cannot create tasks');
select is(pg_temp.rows_affected($$update public.tasks set notes = 'hacked'$$),
          0, 'operator cannot edit tasks directly');

select lives_ok(
  $$insert into public.scene_photos (scene_id, storage_path, thumb_path, uploaded_by)
    values ('20000000-0000-0000-0000-00000000000a', 'rls/op.jpg', 'rls/op_t.webp', '00000000-0000-0000-0000-00000000000c')$$,
  'operator can add photos in assigned venue');
select throws_ok(
  $$insert into public.scene_photos (scene_id, storage_path, thumb_path, uploaded_by)
    values ('20000000-0000-0000-0000-00000000000b', 'rls/op2.jpg', 'rls/op2_t.webp', '00000000-0000-0000-0000-00000000000c')$$,
  '42501', null, 'operator cannot add photos in unassigned venue');

select lives_ok(
  $$select public.set_task_feasibility('30000000-0000-0000-0000-00000000000a', 'feasible', 'works')$$,
  'operator can record feasibility in assigned venue');
select throws_ok(
  $$select public.set_task_feasibility('30000000-0000-0000-0000-00000000000b', 'feasible', 'nope')$$,
  '42501', null, 'operator cannot record feasibility in unassigned venue');
select throws_ok(
  $$select public.set_task_feasibility('30000000-0000-0000-0000-00000000000a', 'ready', null)$$,
  '22023', null, 'feasibility RPC only accepts feasibility results');

select lives_ok(
  $$insert into public.sessions (id, operator_id, venue_id)
    values ('50000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000c', '10000000-0000-0000-0000-00000000000a')$$,
  'operator can start own session in assigned venue');
select throws_ok(
  $$insert into public.sessions (operator_id, venue_id)
    values ('00000000-0000-0000-0000-0000000000d1', '10000000-0000-0000-0000-00000000000a')$$,
  '42501', null, 'operator cannot start a session for someone else');
select lives_ok(
  $$insert into public.episodes (session_id, task_id, outcome)
    values ('50000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000000a', 'success')$$,
  'operator can log an episode in own session');
select throws_ok(
  $$insert into public.episodes (session_id, task_id, outcome)
    values ('50000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000000b', 'success')$$,
  '42501', null, 'operator cannot log an episode for a task in another venue');

select is((select count(*)::int from public.audit_log), 0, 'operator cannot read the audit log');
select is((select count(*)::int from public.api_keys), 0, 'operator cannot read API keys');
select throws_ok($$insert into public.venue_assignments (venue_id, user_id)
  values ('10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000c')$$,
  '42501', null, 'operator cannot assign themselves to a venue');

-- ---------------------------------------------------------------------------
-- Viewer: read-only, assigned venue only
-- ---------------------------------------------------------------------------
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');

select is((select count(*)::int from public.tasks where id = '30000000-0000-0000-0000-00000000000a'),
          1, 'viewer reads tasks in assigned venue');
select throws_ok(
  $$insert into public.scenes (venue_id, name) values ('10000000-0000-0000-0000-00000000000a', 'v')$$,
  '42501', null, 'viewer cannot create scenes');
select throws_ok(
  $$insert into public.scene_photos (scene_id, storage_path, thumb_path, uploaded_by)
    values ('20000000-0000-0000-0000-00000000000a', 'rls/v.jpg', 'rls/v_t.webp', '00000000-0000-0000-0000-0000000000b1')$$,
  '42501', null, 'viewer cannot upload photos');
select throws_ok(
  $$insert into public.sessions (operator_id, venue_id)
    values ('00000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-00000000000a')$$,
  '42501', null, 'viewer cannot start sessions');
select is(pg_temp.rows_affected($$update public.tasks set notes = 'x'$$),
          0, 'viewer cannot edit tasks');
select throws_ok(
  $$select public.set_task_feasibility('30000000-0000-0000-0000-00000000000a', 'infeasible', null)$$,
  '42501', null, 'viewer cannot record feasibility');

-- ---------------------------------------------------------------------------
-- Designer: everything business-side, nothing admin-side
-- ---------------------------------------------------------------------------
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
select is((select count(*)::int from public.tasks where instruction like 'RLS task%'), 2, 'designer reads all venues');
select throws_ok($$insert into public.task_versions (task_id, version, instruction)
  values ('30000000-0000-0000-0000-00000000000a', 99, 'forged')$$,
  '42501', null, 'nobody can forge version history');
select is((select count(*)::int from public.api_keys), 0, 'designer cannot read API keys');

-- ---------------------------------------------------------------------------
-- Admin
-- ---------------------------------------------------------------------------
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select ok((select count(*) from public.audit_log) > 0, 'admin reads the audit log');
select is((select count(*)::int from public.tasks where instruction like 'RLS task%'), 2, 'admin reads all venues');

-- Self-signups are plain viewers with no venues: they see no tasks and cannot write.
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000f1');
select is((select count(*)::int from public.tasks), 0, 'new self-signup sees no venues or tasks');
select throws_ok($$insert into public.tasks (scene_id, instruction) values ('20000000-0000-0000-0000-00000000000a', 'x')$$,
  '42501', null, 'new self-signup cannot create tasks');

-- ---------------------------------------------------------------------------
-- Deactivated users and anonymous requests get nothing
-- ---------------------------------------------------------------------------
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
select is((select count(*)::int from public.tasks), 0, 'deactivated user sees nothing');

reset role;
set local role anon;
select throws_ok($$select count(*) from public.tasks$$, '42501', null, 'anon has no table access');

select * from finish();
rollback;
