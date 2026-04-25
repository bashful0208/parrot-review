-- 允许 review_comments 关联到非行级、非 issue 的 PR 整体评论（如 PR 摘要回写）
-- 背景：原约束要求每条评论必须关联一个 review_issue，
-- 但 PR 摘要评论不绑定具体 issue，需要把 review_issue_id 改为可空。

alter table public.review_comments
  alter column review_issue_id drop not null;

comment on column public.review_comments.review_issue_id is
  '关联的 review_issue；PR 整体评论（如摘要）为 NULL。';
