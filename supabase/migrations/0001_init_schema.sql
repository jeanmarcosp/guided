-- Guided — Phase 0 schema
-- Normalized backing store for the client's flat Guide -> Layer[] / Place[] model.
-- The client shape (lib/types.ts) is unchanged; translation happens in lib/api/mappers.ts.

create extension if not exists "pgcrypto"; -- gen_random_uuid()

-- ---------------------------------------------------------------------------
-- updated_at auto-touch
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles (mirrors auth.users)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text,
  display_name text,
  avatar_url   text,
  created_at   timestamptz not null default now()
);

-- Auto-create a profile row whenever a user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- guides
-- ---------------------------------------------------------------------------
create table public.guides (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references public.profiles (id) on delete cascade,
  name       text not null,
  emoji      text not null,
  color      text not null,
  pinned     boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index guides_owner_id_idx on public.guides (owner_id);

create trigger guides_touch_updated_at
  before update on public.guides
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- layers
-- ---------------------------------------------------------------------------
create table public.layers (
  id         uuid primary key default gen_random_uuid(),
  guide_id   uuid not null references public.guides (id) on delete cascade,
  name       text not null,
  color      text not null,
  emoji      text not null,
  kind       text,
  hidden     boolean not null default false,
  collapsed  boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index layers_guide_id_idx on public.layers (guide_id);

create trigger layers_touch_updated_at
  before update on public.layers
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- places
-- ---------------------------------------------------------------------------
create table public.places (
  id         uuid primary key default gen_random_uuid(),
  guide_id   uuid not null references public.guides (id) on delete cascade,
  layer_id   uuid references public.layers (id) on delete set null,
  name       text not null,
  address    text,
  latitude   double precision not null,
  longitude  double precision not null,
  category   text,
  added_by   uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(), -- maps to client Place.addedAt
  updated_at timestamptz not null default now()
);

create index places_guide_id_idx on public.places (guide_id);
create index places_layer_id_idx on public.places (layer_id);

-- Dedupe guard: mirrors the client's ~1e-6 coordinate proximity check in
-- addPlaceToGuide. Concurrent adds of the same spot (phase 2) collide here and
-- the second insert is rejected; the client treats that as "already added".
create unique index places_guide_coord_uniq
  on public.places (
    guide_id,
    round(latitude::numeric, 5),
    round(longitude::numeric, 5)
  );

create trigger places_touch_updated_at
  before update on public.places
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- guide_shares (share-link based; role reserved for phase 2 editors)
-- ---------------------------------------------------------------------------
create table public.guide_shares (
  id          uuid primary key default gen_random_uuid(),
  guide_id    uuid not null references public.guides (id) on delete cascade,
  token       uuid not null unique default gen_random_uuid(),
  role        text not null default 'viewer' check (role in ('viewer', 'editor')),
  shared_with uuid references public.profiles (id) on delete cascade,
  status      text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at  timestamptz not null default now(),
  unique (guide_id, shared_with)
);

create index guide_shares_token_idx on public.guide_shares (token);
create index guide_shares_shared_with_idx on public.guide_shares (shared_with);
