create table if not exists public.password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users (id) on delete cascade,
  token_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz null,
  created_at timestamptz not null default now(),
  unique (token_hash)
);

create index if not exists password_reset_tokens_user_id_idx
  on public.password_reset_tokens (user_id);

create index if not exists password_reset_tokens_expires_at_idx
  on public.password_reset_tokens (expires_at);
