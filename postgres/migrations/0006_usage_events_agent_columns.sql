-- 0006_usage_events_agent_columns.sql
-- 引入 LangGraph 多 agent + 反思循环后，每个 review_run 的 LLM 调用从 2 次涨到 5~30 次。
-- 加 agent_role / attempt_number 两列做归因，扩 ai_task_type enum 容纳 critic / regenerator。

-- ALTER TYPE ADD VALUE 必须在事务外执行（PG 限制），psql 默认非事务模式 OK
alter type public.ai_task_type add value if not exists 'verify_finding';
alter type public.ai_task_type add value if not exists 'regenerate_finding';

alter table public.usage_events
  add column if not exists agent_role text,
  add column if not exists attempt_number integer not null default 0;

create index if not exists idx_usage_events_review_run_agent
  on public.usage_events (review_run_id, agent_role);

comment on column public.usage_events.agent_role is
  'LangGraph agent 节点角色: quality | security | aggregator | critic | regenerator | summarizer';
comment on column public.usage_events.attempt_number is
  'critic/regenerator 反思循环里的迭代次数(0-indexed); 非反思节点固定 0';
