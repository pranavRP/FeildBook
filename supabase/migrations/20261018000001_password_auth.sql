-- Password sign-in with open sign-up; 2FA no longer required.
--
-- 1. Roles now come from raw_app_meta_data, which only the service role can set.
--    raw_user_meta_data is user-controlled (anyone can pass `data` to signUp),
--    so a self-signup can never choose its own role: it is always a viewer.
-- 2. Admin privileges no longer depend on an aal2 (TOTP) session.

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.user_role := 'viewer';
  v_app jsonb := coalesce(new.raw_app_meta_data, '{}'::jsonb);
  v_user jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  if v_app ->> 'role' in ('admin', 'designer', 'operator', 'viewer') then
    v_role := (v_app ->> 'role')::public.user_role;
  end if;

  insert into public.profiles (id, email, full_name, role, is_contractor)
  values (
    new.id,
    new.email,
    left(nullif(trim(v_user ->> 'full_name'), ''), 120),
    v_role,
    coalesce((v_app ->> 'is_contractor')::boolean, false)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace function private.app_role()
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.profiles p
  where p.id = auth.uid()
    and p.active
$$;
