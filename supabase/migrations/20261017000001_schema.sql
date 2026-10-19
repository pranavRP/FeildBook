-- =============================================================================
-- Fieldbook schema: tables, enums, indexes.
-- RLS policies live in a later migration; every table here gets RLS enabled.
-- =============================================================================

create extension if not exists pg_trgm with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- Helpers that RLS policies call. Not exposed through the Data API.
create schema if not exists private;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.user_role as enum ('admin', 'designer', 'operator', 'viewer');

create type public.task_status as enum (
  'proposed',
  'feasibility_test',
  'feasible',
  'needs_change',
  'infeasible',
  'ready',
  'collecting',
  'done'
);

create type public.photo_kind as enum ('reference', 'layout', 'reset', 'other');
create type public.prop_source as enum ('at_scene', 'to_buy');
create type public.episode_outcome as enum ('success', 'failure', 'aborted');

-- ---------------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------------
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  full_name     text,
  email         text not null,
  role          public.user_role not null default 'viewer',
  is_contractor boolean not null default false,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index profiles_email_key on public.profiles (lower(email));

-- ---------------------------------------------------------------------------
-- Venues & scenes
-- ---------------------------------------------------------------------------
create table public.venues (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  address          text,
  notes            text,
  drive_folder_url text,
  archived         boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create unique index venues_name_key on public.venues (lower(name));

create table public.venue_assignments (
  venue_id   uuid not null references public.venues (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (venue_id, user_id)
);
create index venue_assignments_user_idx on public.venue_assignments (user_id);

create table public.scenes (
  id                 uuid primary key default gen_random_uuid(),
  venue_id           uuid not null references public.venues (id) on delete restrict,
  name               text not null,
  description        text,
  surface_height_in  numeric(5, 1),
  clearance_notes    text,
  reset_instructions text,
  archived           boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create unique index scenes_venue_name_key on public.scenes (venue_id, lower(name));

create table public.scene_photos (
  id           uuid primary key default gen_random_uuid(),
  scene_id     uuid not null references public.scenes (id) on delete cascade,
  kind         public.photo_kind not null default 'reference',
  storage_path text not null unique,
  thumb_path   text not null,
  caption      text,
  annotations  jsonb not null default '[]'::jsonb,
  width        integer,
  height       integer,
  -- sha256 of the original bytes; lets the importer stay idempotent.
  content_hash text,
  uploaded_by  uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now()
);
create index scene_photos_scene_idx on public.scene_photos (scene_id, created_at);
create unique index scene_photos_hash_key on public.scene_photos (scene_id, content_hash)
  where content_hash is not null;

-- ---------------------------------------------------------------------------
-- Tasks
-- ---------------------------------------------------------------------------
create sequence public.task_code_seq;

create table public.tasks (
  id                    uuid primary key default gen_random_uuid(),
  -- Stable human ID. Comes from a sequence, so codes are never reused.
  code                  text not null unique
                          default ('T-' || lpad(nextval('public.task_code_seq')::text, 4, '0')),
  scene_id              uuid not null references public.scenes (id) on delete restrict,
  instruction           text not null check (length(trim(instruction)) > 0),
  status                public.task_status not null default 'proposed',
  priority              smallint not null default 2 check (priority between 1 and 3),
  arms_required         smallint not null default 1 check (arms_required in (1, 2)),
  max_prop_weight_g     integer check (max_prop_weight_g is null or max_prop_weight_g > 0),
  difficulty            smallint check (difficulty is null or difficulty between 1 and 5),
  target_episodes       integer not null default 50 check (target_episodes > 0),
  success_count         integer not null default 0,
  episode_count         integer not null default 0,
  feasibility_notes     text,
  notes                 text,
  tags                  text[] not null default '{}',
  current_version       integer not null default 1,
  -- Transient: set together with a new instruction; consumed by the version trigger.
  version_change_reason text,
  -- Importer idempotency key (normalized source instruction).
  import_key            text unique,
  created_by            uuid references public.profiles (id) on delete set null,
  archived              boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index tasks_scene_idx on public.tasks (scene_id);
create index tasks_status_idx on public.tasks (status) where not archived;
create index tasks_tags_idx on public.tasks using gin (tags);
create index tasks_instruction_trgm_idx on public.tasks
  using gin (instruction extensions.gin_trgm_ops);

create table public.task_versions (
  id            uuid primary key default gen_random_uuid(),
  -- Deferred so the tasks BEFORE INSERT trigger can write version 1.
  task_id       uuid not null references public.tasks (id) on delete cascade
                  deferrable initially deferred,
  version       integer not null,
  instruction   text not null,
  change_reason text,
  changed_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  unique (task_id, version)
);

-- ---------------------------------------------------------------------------
-- Props
-- ---------------------------------------------------------------------------
create table public.props (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index props_name_key on public.props (lower(name));

create table public.task_props (
  task_id    uuid not null references public.tasks (id) on delete cascade,
  prop_id    uuid not null references public.props (id) on delete restrict,
  qty        integer not null default 1 check (qty > 0),
  source     public.prop_source not null default 'at_scene',
  acquired   boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (task_id, prop_id)
);
create index task_props_prop_idx on public.task_props (prop_id);
create index task_props_shopping_idx on public.task_props (source, acquired);

-- ---------------------------------------------------------------------------
-- Rigs, API keys, sessions, episodes
-- ---------------------------------------------------------------------------
create table public.rigs (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  arm_model  text,
  headset    text,
  arms       smallint not null default 1 check (arms in (1, 2)),
  active     boolean not null default true,
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index rigs_name_key on public.rigs (lower(name));

create table public.api_keys (
  id           uuid primary key default gen_random_uuid(),
  rig_id       uuid not null references public.rigs (id) on delete cascade,
  label        text,
  prefix       text not null unique check (prefix ~ '^[a-z0-9]{8}$'),
  key_hash     text not null check (key_hash ~ '^[0-9a-f]{64}$'),
  created_by   uuid references public.profiles (id) on delete set null,
  last_used_at timestamptz,
  revoked_at   timestamptz,
  created_at   timestamptz not null default now()
);
create index api_keys_rig_idx on public.api_keys (rig_id);

create table public.sessions (
  id          uuid primary key default gen_random_uuid(),
  rig_id      uuid references public.rigs (id) on delete set null,
  operator_id uuid not null references public.profiles (id) on delete restrict,
  venue_id    uuid not null references public.venues (id) on delete restrict,
  source      text not null default 'ui' check (source in ('ui', 'api')),
  started_at  timestamptz not null default now(),
  ended_at    timestamptz,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (ended_at is null or ended_at >= started_at)
);
create index sessions_operator_idx on public.sessions (operator_id, started_at desc);
create index sessions_venue_idx on public.sessions (venue_id);

create table public.episodes (
  id             uuid primary key default gen_random_uuid(),
  -- Client-generated; unique so retries on flaky Wi-Fi are idempotent.
  external_id    uuid not null unique default gen_random_uuid(),
  session_id     uuid not null references public.sessions (id) on delete restrict,
  task_id        uuid not null references public.tasks (id) on delete restrict,
  task_version   integer not null,
  outcome        public.episode_outcome not null,
  failure_reason text,
  duration_s     numeric(8, 2) check (duration_s is null or duration_s >= 0),
  data_uri       text,
  metadata       jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);
create index episodes_task_idx on public.episodes (task_id, created_at desc);
create index episodes_session_idx on public.episodes (session_id, created_at desc);
create index episodes_created_idx on public.episodes (created_at desc);

-- ---------------------------------------------------------------------------
-- Audit log (written only by triggers)
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id         bigint generated always as identity primary key,
  actor_id   uuid,
  action     text not null,
  table_name text not null,
  row_id     text,
  diff       jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_created_idx on public.audit_log (created_at desc);
create index audit_log_row_idx on public.audit_log (table_name, row_id);

-- ---------------------------------------------------------------------------
-- API rate limiting (service role only; private schema)
-- ---------------------------------------------------------------------------
create table private.api_rate_limits (
  key_id       uuid not null,
  window_start timestamptz not null,
  hits         integer not null default 0,
  primary key (key_id, window_start)
);

-- ---------------------------------------------------------------------------
-- Deny by default: RLS on every public table.
-- ---------------------------------------------------------------------------
alter table public.profiles          enable row level security;
alter table public.venues            enable row level security;
alter table public.venue_assignments enable row level security;
alter table public.scenes            enable row level security;
alter table public.scene_photos      enable row level security;
alter table public.tasks             enable row level security;
alter table public.task_versions     enable row level security;
alter table public.props             enable row level security;
alter table public.task_props        enable row level security;
alter table public.rigs              enable row level security;
alter table public.api_keys          enable row level security;
alter table public.sessions          enable row level security;
alter table public.episodes          enable row level security;
alter table public.audit_log         enable row level security;
alter table private.api_rate_limits  enable row level security;

-- Anonymous visitors get nothing, anywhere.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from anon, public;
