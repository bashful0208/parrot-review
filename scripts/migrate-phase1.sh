#!/bin/sh
set -eu

# Phase 1 数据库迁移脚本
# 用途：将 postgres/migrations/0001_p0_schema.sql 同步到本地 PostgreSQL

# 加载环境变量
if [ -f .env ]; then
  set -a
  . .env
  set +a
fi

# 使用 .env.example 作为 DATABASE_URL 默认模板
if [ -z "$DATABASE_URL" ] && [ -f .env.example ]; then
  eval "$(grep '^DATABASE_URL=' .env.example)"
fi

# 校验必需变量
if [ -z "$DATABASE_URL" ]; then
  echo "错误：DATABASE_URL 未设置，请确保 .env 或 .env.example 中有定义"
  echo ""
  echo "快速修复："
  echo "  cp .env.example .env"
  echo "  # 然后手动编辑 .env 设置正确的 DATABASE_URL"
  exit 1
fi

# 执行迁移
echo "开始同步 Phase 1 schema 到数据库..."
echo "数据库连接：$DATABASE_URL"
echo ""

psql "$DATABASE_URL" -f postgres/migrations/0001_p0_schema.sql

if [ $? -eq 0 ]; then
  echo ""
  echo "✓ Phase 1 schema 同步成功"
  echo ""
  echo "验证：查询核心表结构"
  echo ""
  psql "$DATABASE_URL" -c "\dt public.*" | grep -E "(organizations|memberships|repositories|pull_requests|review_runs)"
else
  echo ""
  echo "✗ 迁移失败，请检查："
  echo "  1. PostgreSQL 是否运行并可连接"
  echo "  2. DATABASE_URL 是否正确"
  echo "  3. postgres/migrations/0001_p0_schema.sql 语法是否正确"
  exit 1
fi
