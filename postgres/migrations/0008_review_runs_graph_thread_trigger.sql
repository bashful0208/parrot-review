-- 0008_review_runs_graph_thread_trigger.sql
-- 让 graph_thread_id 在 INSERT 时自动从 NEW.id 同步。
--
-- 背景：0007 加了 graph_thread_id 列。原来想用 CTE
-- (INSERT ... RETURNING id) UPDATE ... 一次写入，但 PG 的 snapshot
-- 语义让 UPDATE 看不到 CTE INSERT 写入的行（同 statement snapshot），
-- UPDATE 0 rows，createReviewRun() 拿到空 result 抛错。
--
-- 改用 BEFORE INSERT trigger：插入前 NEW.id 已由 default gen_random_uuid()
-- 生成，trigger 把 NEW.id 抄到 NEW.graph_thread_id 即可。
-- createReviewRun() 不再需要写 graph_thread_id 列。

create or replace function public.sync_review_run_graph_thread_id()
returns trigger as $$
begin
  if new.graph_thread_id is null then
    new.graph_thread_id := new.id::text;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_review_runs_graph_thread on public.review_runs;

create trigger trg_review_runs_graph_thread
  before insert on public.review_runs
  for each row
  execute function public.sync_review_run_graph_thread_id();

-- Backfill：把 0007 之后插入但没经过 trigger 的旧行补上
update public.review_runs
   set graph_thread_id = id::text
 where graph_thread_id is null;
