-- 0012: Add is_fallback column to ai_provider_configs
-- 支持备用 AI provider 配置，主 provider 超时/不可用时自动 fallback

ALTER TABLE public.ai_provider_configs
  ADD COLUMN IF NOT EXISTS is_fallback boolean NOT NULL DEFAULT false;

-- 索引：按 organization_id + is_active + is_fallback 快速查找
CREATE INDEX IF NOT EXISTS idx_ai_provider_configs_org_active_fallback
  ON public.ai_provider_configs (organization_id, is_active, is_fallback);
