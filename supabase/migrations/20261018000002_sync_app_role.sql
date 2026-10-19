-- The Auth admin API writes app_metadata after inserting the user row, so also
-- sync the profile when the server-set app_metadata.role / is_contractor changes.
-- (Users cannot modify app_metadata; only the service role can.)
create or replace function private.handle_user_app_metadata()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new jsonb := coalesce(new.raw_app_meta_data, '{}'::jsonb);
  v_old jsonb := coalesce(old.raw_app_meta_data, '{}'::jsonb);
begin
  if v_new ->> 'role' is distinct from v_old ->> 'role'
     and v_new ->> 'role' in ('admin', 'designer', 'operator', 'viewer') then
    update public.profiles set role = (v_new ->> 'role')::public.user_role where id = new.id;
  end if;
  if v_new ->> 'is_contractor' is distinct from v_old ->> 'is_contractor' then
    update public.profiles
       set is_contractor = coalesce((v_new ->> 'is_contractor')::boolean, false)
     where id = new.id;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_app_metadata
  after update of raw_app_meta_data on auth.users
  for each row execute function private.handle_user_app_metadata();
