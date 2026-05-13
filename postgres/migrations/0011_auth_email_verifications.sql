create table if not exists public.email_verification_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users (id) on delete cascade,
  email text not null,
  token_hash text not null,
  expires_at timestamptz not null,
  verified_at timestamptz null,
  created_at timestamptz not null default now(),
  unique (token_hash)
);

create index if not exists email_verification_tokens_user_id_idx
  on public.email_verification_tokens (user_id);
