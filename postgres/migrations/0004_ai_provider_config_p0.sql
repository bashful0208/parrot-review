-- P0 临时迁移：新增 custom provider，并将 vault_secret_id 改为可空
-- 背景：vault_secret_id 目前保持可空直到接入真实 vault 系统
-- 此迁移添加 'custom' 类型以支持用户自定义 AI provider

-- 向 ai_provider enum 类型添加 'custom' 值
alter type public.ai_provider add value if not exists 'custom';

-- 将 ai_provider_configs.vault_secret_id 改为可空
alter table public.ai_provider_configs
  alter column vault_secret_id drop not null;
