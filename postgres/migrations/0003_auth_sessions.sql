create table if not exists public.auth_identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users (id) on delete cascade,
  provider text not null,
  subject text not null,
  email text null,
  email_verified_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, subject)
);

create index if not exists auth_identities_user_id_idx
  on public.auth_identities (user_id);

create table if not exists public.local_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users (id) on delete cascade,
  password_hash text not null,
  password_algo text not null default 'scrypt',
  password_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create table if not exists public.user_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users (id) on delete cascade,
  session_token_hash text not null,
  expires_at timestamptz not null,
  ip_address text null,
  user_agent text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_token_hash)
);

create index if not exists user_sessions_user_id_idx
  on public.user_sessions (user_id);

create index if not exists user_sessions_expires_at_idx
  on public.user_sessions (expires_at);

create trigger set_auth_identities_updated_at
before update on public.auth_identities
for each row execute function public.set_updated_at();

create trigger set_local_credentials_updated_at
before update on public.local_credentials
for each row execute function public.set_updated_at();

create trigger set_user_sessions_updated_at
before update on public.user_sessions
for each row execute function public.set_updated_at();
