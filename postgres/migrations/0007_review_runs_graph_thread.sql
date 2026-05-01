-- 0007_review_runs_graph_thread.sql
-- 冗余存 LangGraph thread_id（值就是 review_run.id），便于 join checkpoints 表做调试 / 巡检。

alter table public.review_runs
  add column if not exists graph_thread_id text;

create index if not exists idx_review_runs_graph_thread
  on public.review_runs (graph_thread_id);

comment on column public.review_runs.graph_thread_id is
  'LangGraph thread_id（= review_run.id 自身）；冗余存便于 join checkpoint_*';
