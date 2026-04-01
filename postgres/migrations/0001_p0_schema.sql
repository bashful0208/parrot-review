create extension if not exists pgcrypto;

create type public.git_provider as enum ('github', 'gitlab', 'gitee');
create type public.member_role as enum ('owner', 'admin', 'member');
create type public.repo_status as enum ('active', 'disabled');
create type public.review_mode as enum ('relaxed', 'standard', 'strict');
create type public.output_language as enum ('zh-CN', 'en-US', 'es-ES');
create type public.review_run_status as enum ('queued', 'running', 'succeeded', 'failed', 'retrying', 'cancelled');
create type public.review_trigger as enum ('pr_opened', 'pr_synchronize', 'pr_reopened', 'manual_rerun', 'rules_changed');
create type public.issue_type as enum ('quality', 'security');
create type public.severity as enum ('low', 'medium', 'high', 'critical');
create type public.issue_status as enum ('open', 'resolved', 'ignored', 'confirmed');
create type public.comment_status as enum ('draft', 'posted', 'skipped', 'failed', 'hidden');
create type public.feedback_type as enum ('helpful', 'unhelpful', 'false_positive', 'ignored');
create type public.ai_provider as enum ('openai', 'anthropic', 'alibaba');
create type public.ai_task_type as enum ('review_summary', 'review_findings', 'fix_prompt', 'embedding');
create type public.rule_source_type as enum ('platform_ui', 'repo_yaml');

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  external_subject text null,
  email text null,
  display_name text null,
  avatar_url text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists app_users_external_subject_uidx
  on public.app_users (external_subject)
  where external_subject is not null;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  status text not null default 'active',
  plan_tier text not null default 'free',
  default_output_language public.output_language not null default 'zh-CN',
  default_review_mode public.review_mode not null default 'standard',
  owner_user_id uuid null references public.app_users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (slug)
);

create table if not exists public.memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.app_users (id) on delete cascade,
  role public.member_role not null default 'member',
  status text not null default 'active',
  invited_by uuid null references public.app_users (id) on delete set null,
  joined_at timestamptz null,
  join_source text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create index if not exists memberships_user_id_idx on public.memberships (user_id);

create table if not exists public.repositories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  provider public.git_provider not null,
  provider_repo_id text not null,
  name text not null,
  full_name text not null,
  provider_owner_namespace text null,
  default_branch text not null,
  status public.repo_status not null default 'active',
  default_output_language public.output_language not null default 'zh-CN',
  default_review_mode public.review_mode not null default 'standard',
  default_ai_binding_id uuid null,
  last_synced_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, provider, provider_repo_id)
);

create index if not exists repositories_org_status_idx
  on public.repositories (organization_id, status);

create table if not exists public.repo_integrations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  repository_id uuid not null references public.repositories (id) on delete cascade,
  provider public.git_provider not null,
  installation_id text null,
  provider_owner_id text null,
  credential_vault_secret_id uuid null,
  webhook_secret_vault_secret_id uuid null,
  status text not null default 'active',
  last_health_check_at timestamptz null,
  last_health_check_result text null,
  last_synced_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (repository_id, provider)
);

create index if not exists repo_integrations_org_provider_idx
  on public.repo_integrations (organization_id, provider);

create table if not exists public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid null references public.organizations (id) on delete cascade,
  repository_id uuid null references public.repositories (id) on delete cascade,
  provider public.git_provider not null,
  event_type text not null,
  delivery_id text null,
  signature_valid boolean not null default false,
  payload_hash text not null,
  status text not null default 'received',
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz null,
  error_message text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, delivery_id)
);

create index if not exists webhook_events_status_created_at_idx
  on public.webhook_events (status, created_at desc);

create table if not exists public.pull_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  repository_id uuid not null references public.repositories (id) on delete cascade,
  provider_pr_id text not null,
  provider_pr_number integer not null,
  title text not null,
  description text null,
  author_login text null,
  base_branch text not null,
  head_branch text not null,
  base_sha text not null,
  head_sha text not null,
  state text not null default 'open',
  opened_at timestamptz not null default now(),
  closed_at timestamptz null,
  merged_at timestamptz null,
  latest_review_run_id uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (repository_id, provider_pr_id)
);

create index if not exists pull_requests_repository_state_idx
  on public.pull_requests (repository_id, state);

create index if not exists pull_requests_repository_head_sha_idx
  on public.pull_requests (repository_id, head_sha);

create table if not exists public.pr_commits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  pull_request_id uuid not null references public.pull_requests (id) on delete cascade,
  commit_sha text not null,
  parent_sha text null,
  message_summary text null,
  author_name text null,
  author_email text null,
  committed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pull_request_id, commit_sha)
);

create index if not exists pr_commits_pr_committed_at_idx
  on public.pr_commits (pull_request_id, committed_at desc);

create table if not exists public.rule_sets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  repository_id uuid not null references public.repositories (id) on delete cascade,
  source_type public.rule_source_type not null,
  name text not null,
  is_active boolean not null default true,
  current_version_id uuid null,
  last_applied_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists rule_sets_repository_source_active_idx
  on public.rule_sets (repository_id, source_type, is_active);

create table if not exists public.rule_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  rule_set_id uuid not null references public.rule_sets (id) on delete cascade,
  version_no integer not null check (version_no > 0),
  content_yaml text not null,
  content_json jsonb null,
  checksum text not null,
  validation_status text not null default 'valid',
  validation_errors jsonb null,
  source_commit_sha text null,
  created_by_user_id uuid null references public.app_users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (rule_set_id, version_no)
);

create index if not exists rule_versions_rule_set_created_at_idx
  on public.rule_versions (rule_set_id, created_at desc);

create table if not exists public.ai_provider_configs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  provider public.ai_provider not null,
  display_name text not null,
  vault_secret_id uuid not null,
  base_url text null,
  masked_key_suffix text null,
  is_active boolean not null default true,
  created_by_user_id uuid null references public.app_users (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, display_name)
);

create index if not exists ai_provider_configs_org_provider_active_idx
  on public.ai_provider_configs (organization_id, provider, is_active);

create table if not exists public.ai_provider_bindings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  repository_id uuid null references public.repositories (id) on delete cascade,
  task_type public.ai_task_type not null,
  provider_config_id uuid not null references public.ai_provider_configs (id) on delete restrict,
  model_name text not null,
  fallback_provider_config_id uuid null references public.ai_provider_configs (id) on delete restrict,
  fallback_model_name text null,
  is_active boolean not null default true,
  priority integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_provider_bindings_lookup_idx
  on public.ai_provider_bindings (organization_id, repository_id, task_type, is_active);

create unique index if not exists ai_provider_bindings_org_default_uidx
  on public.ai_provider_bindings (organization_id, task_type)
  where repository_id is null and is_active = true;

create unique index if not exists ai_provider_bindings_repo_override_uidx
  on public.ai_provider_bindings (repository_id, task_type)
  where repository_id is not null and is_active = true;

create table if not exists public.review_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  repository_id uuid not null references public.repositories (id) on delete cascade,
  pull_request_id uuid not null references public.pull_requests (id) on delete cascade,
  run_number integer not null check (run_number > 0),
  task_source text null,
  trigger_type public.review_trigger not null,
  trigger_event_id uuid null references public.webhook_events (id) on delete set null,
  review_mode public.review_mode not null,
  output_language public.output_language not null,
  status public.review_run_status not null default 'queued',
  base_sha text not null,
  head_sha text not null,
  queue_job_id text null,
  ai_provider_config_id uuid null references public.ai_provider_configs (id) on delete set null,
  ai_model_name text null,
  fallback_provider_config_id uuid null references public.ai_provider_configs (id) on delete set null,
  fallback_model_name text null,
  rule_snapshot jsonb not null default '{}'::jsonb,
  summary_md text null,
  analyzed_files_count integer not null default 0 check (analyzed_files_count >= 0),
  findings_count integer not null default 0 check (findings_count >= 0),
  security_findings_count integer not null default 0 check (security_findings_count >= 0),
  started_at timestamptz null,
  finished_at timestamptz null,
  retry_count integer not null default 0 check (retry_count >= 0),
  error_code text null,
  error_message text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pull_request_id, run_number)
);

create index if not exists review_runs_pr_created_at_idx
  on public.review_runs (pull_request_id, created_at desc);

create index if not exists review_runs_status_created_at_idx
  on public.review_runs (status, created_at desc);

create table if not exists public.changed_files (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  pull_request_id uuid not null references public.pull_requests (id) on delete cascade,
  review_run_id uuid not null references public.review_runs (id) on delete cascade,
  file_path text not null,
  previous_path text null,
  change_type text not null,
  additions integer not null default 0 check (additions >= 0),
  deletions integer not null default 0 check (deletions >= 0),
  is_binary boolean not null default false,
  patch_excerpt text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (review_run_id, file_path, previous_path)
);

create index if not exists changed_files_pr_run_idx
  on public.changed_files (pull_request_id, review_run_id);

create table if not exists public.review_issues (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  repository_id uuid not null references public.repositories (id) on delete cascade,
  pull_request_id uuid not null references public.pull_requests (id) on delete cascade,
  review_run_id uuid not null references public.review_runs (id) on delete cascade,
  fingerprint text not null,
  issue_type public.issue_type not null default 'quality',
  category text null,
  title text not null,
  summary text not null,
  severity public.severity not null,
  confidence_score numeric(5,4) not null check (confidence_score >= 0 and confidence_score <= 1),
  fixability_score numeric(5,4) not null default 0 check (fixability_score >= 0 and fixability_score <= 1),
  file_path text null,
  start_line integer null,
  end_line integer null,
  code_excerpt text null,
  suggestion_md text null,
  root_cause text null,
  impact_scope text null,
  status public.issue_status not null default 'open',
  first_seen_run_id uuid null references public.review_runs (id) on delete set null,
  last_seen_run_id uuid null references public.review_runs (id) on delete set null,
  resolved_in_run_id uuid null references public.review_runs (id) on delete set null,
  ignored_by_user_id uuid null references public.app_users (id) on delete set null,
  ignored_reason text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (review_run_id, fingerprint)
);

create index if not exists review_issues_pr_fingerprint_idx
  on public.review_issues (pull_request_id, fingerprint);

create index if not exists review_issues_run_severity_confidence_idx
  on public.review_issues (review_run_id, severity, confidence_score desc);

create index if not exists review_issues_run_issue_type_idx
  on public.review_issues (review_run_id, issue_type);

create table if not exists public.review_comments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  pull_request_id uuid not null references public.pull_requests (id) on delete cascade,
  review_run_id uuid not null references public.review_runs (id) on delete cascade,
  review_issue_id uuid not null references public.review_issues (id) on delete cascade,
  provider public.git_provider null,
  external_comment_id text null,
  body_md text not null,
  output_language public.output_language not null,
  status public.comment_status not null default 'draft',
  is_inline boolean not null default true,
  file_path text null,
  line_number integer null,
  posted_at timestamptz null,
  last_synced_at timestamptz null,
  error_message text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists review_comments_provider_external_uidx
  on public.review_comments (provider, external_comment_id)
  where external_comment_id is not null;

create index if not exists review_comments_issue_idx
  on public.review_comments (review_issue_id);

create index if not exists review_comments_run_status_idx
  on public.review_comments (review_run_id, status);

create table if not exists public.review_feedback (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  review_issue_id uuid not null references public.review_issues (id) on delete cascade,
  review_run_id uuid not null references public.review_runs (id) on delete cascade,
  user_id uuid not null references public.app_users (id) on delete cascade,
  feedback_type public.feedback_type not null,
  reason text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (review_issue_id, user_id)
);

create index if not exists review_feedback_run_type_idx
  on public.review_feedback (review_run_id, feedback_type);

create table if not exists public.agent_prompts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  repository_id uuid not null references public.repositories (id) on delete cascade,
  pull_request_id uuid not null references public.pull_requests (id) on delete cascade,
  review_run_id uuid not null references public.review_runs (id) on delete cascade,
  source_type text not null,
  source_issue_ids uuid[] not null default '{}'::uuid[],
  agent_kind text not null default 'generic',
  output_language public.output_language not null,
  prompt_md text not null,
  prompt_hash text not null,
  generated_by_user_id uuid null references public.app_users (id) on delete set null,
  copied_count integer not null default 0 check (copied_count >= 0),
  last_copied_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists agent_prompts_run_created_at_idx
  on public.agent_prompts (review_run_id, created_at desc);

create index if not exists agent_prompts_pr_created_at_idx
  on public.agent_prompts (pull_request_id, created_at desc);

create table if not exists public.usage_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  repository_id uuid null references public.repositories (id) on delete cascade,
  pull_request_id uuid null references public.pull_requests (id) on delete cascade,
  review_run_id uuid null references public.review_runs (id) on delete cascade,
  review_issue_id uuid null references public.review_issues (id) on delete cascade,
  agent_prompt_id uuid null references public.agent_prompts (id) on delete cascade,
  event_type text not null,
  task_type public.ai_task_type null,
  provider_config_id uuid null references public.ai_provider_configs (id) on delete set null,
  provider public.ai_provider null,
  model_name text null,
  input_tokens integer null check (input_tokens is null or input_tokens >= 0),
  output_tokens integer null check (output_tokens is null or output_tokens >= 0),
  latency_ms integer null check (latency_ms is null or latency_ms >= 0),
  estimated_cost numeric(12,6) null check (estimated_cost is null or estimated_cost >= 0),
  success boolean null,
  error_code text null,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists usage_events_org_occurred_at_idx
  on public.usage_events (organization_id, occurred_at desc);

create index if not exists usage_events_run_event_type_idx
  on public.usage_events (review_run_id, event_type);

create index if not exists usage_events_provider_model_occurred_at_idx
  on public.usage_events (provider, model_name, occurred_at desc);

alter table public.rule_sets
  add constraint rule_sets_current_version_fk
  foreign key (current_version_id)
  references public.rule_versions (id)
  on delete set null;

alter table public.repositories
  add constraint repositories_default_ai_binding_fk
  foreign key (default_ai_binding_id)
  references public.ai_provider_bindings (id)
  on delete set null;

alter table public.pull_requests
  add constraint pull_requests_latest_review_run_fk
  foreign key (latest_review_run_id)
  references public.review_runs (id)
  on delete set null;

create trigger app_users_set_updated_at
before update on public.app_users
for each row execute function public.set_updated_at();

create trigger organizations_set_updated_at
before update on public.organizations
for each row execute function public.set_updated_at();

create trigger memberships_set_updated_at
before update on public.memberships
for each row execute function public.set_updated_at();

create trigger repositories_set_updated_at
before update on public.repositories
for each row execute function public.set_updated_at();

create trigger repo_integrations_set_updated_at
before update on public.repo_integrations
for each row execute function public.set_updated_at();

create trigger webhook_events_set_updated_at
before update on public.webhook_events
for each row execute function public.set_updated_at();

create trigger pull_requests_set_updated_at
before update on public.pull_requests
for each row execute function public.set_updated_at();

create trigger pr_commits_set_updated_at
before update on public.pr_commits
for each row execute function public.set_updated_at();

create trigger rule_sets_set_updated_at
before update on public.rule_sets
for each row execute function public.set_updated_at();

create trigger rule_versions_set_updated_at
before update on public.rule_versions
for each row execute function public.set_updated_at();

create trigger ai_provider_configs_set_updated_at
before update on public.ai_provider_configs
for each row execute function public.set_updated_at();

create trigger ai_provider_bindings_set_updated_at
before update on public.ai_provider_bindings
for each row execute function public.set_updated_at();

create trigger review_runs_set_updated_at
before update on public.review_runs
for each row execute function public.set_updated_at();

create trigger changed_files_set_updated_at
before update on public.changed_files
for each row execute function public.set_updated_at();

create trigger review_issues_set_updated_at
before update on public.review_issues
for each row execute function public.set_updated_at();

create trigger review_comments_set_updated_at
before update on public.review_comments
for each row execute function public.set_updated_at();

create trigger review_feedback_set_updated_at
before update on public.review_feedback
for each row execute function public.set_updated_at();

create trigger agent_prompts_set_updated_at
before update on public.agent_prompts
for each row execute function public.set_updated_at();

create trigger usage_events_set_updated_at
before update on public.usage_events
for each row execute function public.set_updated_at();
