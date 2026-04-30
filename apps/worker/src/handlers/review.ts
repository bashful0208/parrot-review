import { createHash } from "node:crypto";

import type { Job } from "bullmq";

import {
  getRepositoryWithCredential,
  upsertPullRequest,
  createReviewRun,
  updateReviewRun,
  insertReviewIssues,
  insertReviewComment,
  markCommentPosted,
  getActiveAiProviderConfig,
} from "@reviewer/core";
import type { Logger } from "@reviewer/core";
import type { WebhookJobPayload } from "@reviewer/core";
import {
  generateReviewFindings,
  generateReviewSummary,
  loadReviewerGuidelines,
  loadTargetRepoContext,
  renderBilingualFinding,
  renderBilingualSummary,
} from "@reviewer/ai";
import {
  GiteeProvider,
  GitHubProvider,
  type IProvider,
  type ProviderCredential,
} from "@reviewer/git";

function buildProvider(provider: string): IProvider {
  if (provider === "github") return new GitHubProvider();
  if (provider === "gitee") return new GiteeProvider();
  throw new Error(`Unsupported git provider: ${provider}`);
}

function buildCredential(
  provider: string,
  token: string
): ProviderCredential {
  if (provider === "github") return { type: "github_pat", token };
  if (provider === "gitee") return { type: "gitee_pat", token };
  throw new Error(`Unsupported git provider for credential: ${provider}`);
}

export async function handleReviewJob(
  job: Job<WebhookJobPayload>,
  logger: Logger
): Promise<void> {
  const {
    repositoryId,
    organizationId,
    prNumber,
    headSha,
    baseSha,
    webhookEventId,
  } = job.data;

  let runId: string | undefined;
  try {
    // 步骤 2: 加载仓库和凭证
    const repo = await getRepositoryWithCredential(repositoryId, organizationId);
    if (!repo) {
      throw new Error(`Repository ${repositoryId} not found or missing credential`);
    }
    const credential = buildCredential(repo.provider, repo.credentialToken);

    // 步骤 3: 拉取 PR 详情
    const provider = buildProvider(repo.provider);
    const pr = await provider.getPullRequest(repo.full_name, prNumber, credential, logger);

    // 步骤 4: Upsert pull_requests 记录
    const { id: pullRequestId } = await upsertPullRequest({
      organizationId,
      repositoryId,
      providerPrId: pr.providerPrId,
      providerPrNumber: pr.providerPrNumber,
      title: pr.title,
      description: pr.description,
      authorLogin: pr.authorLogin,
      baseBranch: pr.baseBranch,
      headBranch: pr.headBranch,
      baseSha: pr.baseSha,
      headSha: pr.headSha,
      state: pr.state,
      openedAt: pr.openedAt,
    });

    // 步骤 5: 创建 review_run（queued）
    runId = (await createReviewRun({
      organizationId,
      repositoryId,
      pullRequestId,
      triggerType: "pr_opened",
      triggerEventId: webhookEventId,
      baseSha,
      headSha,
      queueJobId: String(job.id ?? ""),
    })).id;

    // 步骤 6-11: 在 try/catch 中执行，失败时更新 run 状态
    try {
      // 步骤 6: 更新 review_run 为 running
      await updateReviewRun(runId, { status: "running", startedAt: new Date() });

      // 步骤 7: 拉取 diff
      const diffs = await provider.getPullRequestDiff(repo.full_name, prNumber, credential, logger);

      // 步骤 7a: 并发加载 reviewer 自身规范 + 目标仓库背景
      const [guidelines, projectContext] = await Promise.all([
        loadReviewerGuidelines(),
        loadTargetRepoContext(provider, repo.full_name, headSha, credential, logger),
      ]);

      // 步骤 8: 从 DB 加载 AI provider 配置
      const activeConfig = await getActiveAiProviderConfig(organizationId);
      if (!activeConfig) {
        throw new Error(`No active AI provider config for organization ${organizationId}`);
      }
      const adapterConfig = {
        provider: activeConfig.provider,
        model: activeConfig.model,
        apiKey: activeConfig.apiKey,
        baseUrl: activeConfig.baseUrl ?? undefined,
      };
      const reviewContext = {
        fullName: repo.full_name,
        prNumber,
        headSha,
        diffs,
        guidelines,
        projectContext,
      };

      // 步骤 8a: 生成行级 findings
      const result = await generateReviewFindings(reviewContext, adapterConfig);

      // 步骤 8b: 生成 PR 双语摘要（失败不中断行级链路；与回写策略一致）
      let summaryMd: string | null = null;
      try {
        const { summary } = await generateReviewSummary(reviewContext, adapterConfig);
        summaryMd = renderBilingualSummary(summary);
      } catch (err) {
        logger.warn("Failed to generate PR summary", {
          review_run_id: runId,
          error: err instanceof Error ? err.message : String(err),
        });
      }

      // 步骤 9: 计算 fingerprint 并写入 review_issues
      // DB 字段保持单语；fingerprint 用 EN title 稳定（不随翻译漂移），
      // title 同样存 EN，summary / suggestion 存双语 markdown 以便前端展示
      const issueInputs = result.findings.map((f) => ({
        organizationId,
        repositoryId,
        pullRequestId,
        reviewRunId: runId!,
        fingerprint: createHash("sha256")
          .update(`${repositoryId}:${f.filePath}:${f.startLine}:${f.title_en}`)
          .digest("hex"),
        issueType: f.issueType,
        title: f.title_en,
        summary: `${f.summary_en}\n\n${f.summary_zh}`,
        severity: f.severity,
        confidenceScore: f.confidenceScore,
        filePath: f.filePath,
        startLine: f.startLine,
        endLine: f.endLine,
        suggestionMd: `${f.suggestion_en}\n\n${f.suggestion_zh}`,
      }));
      const insertedIssues = await insertReviewIssues(issueInputs);

      // 步骤 10: 先回写 PR 整体摘要评论（与 inline 评论同策略：失败仅 warn 不中断）
      if (summaryMd) {
        try {
          const { id: commentId } = await insertReviewComment({
            organizationId,
            pullRequestId,
            reviewRunId: runId!,
            reviewIssueId: null,
            provider: repo.provider,
            bodyMd: summaryMd,
            filePath: null,
            lineNumber: null,
            isInline: false,
          });

          try {
            const posted = await provider.postPullRequestComment(
              repo.full_name,
              prNumber,
              summaryMd,
              credential,
              logger
            );
            await markCommentPosted(commentId, posted.externalCommentId, posted.createdAt);
          } catch (err) {
            logger.warn("Failed to post PR summary comment to platform", {
              comment_id: commentId,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        } catch (err) {
          logger.warn("Failed to insert PR summary comment record", {
            review_run_id: runId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      // 步骤 11: 再对每条 issue 回写行内评论
      for (let i = 0; i < insertedIssues.length; i++) {
        const issue = insertedIssues[i]!;
        const finding = result.findings[i]!;

        const bodyMd = renderBilingualFinding(finding);

        // a. 插入 review_comment 并发评论（整体失败则 warn 跳过，不中断循环）
        try {
          const { id: commentId } = await insertReviewComment({
            organizationId,
            pullRequestId,
            reviewRunId: runId!,
            reviewIssueId: issue.id,
            provider: repo.provider,
            bodyMd,
            filePath: finding.filePath,
            lineNumber: finding.endLine,
            isInline: true,
          });

          // b. 调用 provider API 发评论（失败不抛，只 log）
          const fileDiff = diffs.find((d) => d.filePath === finding.filePath);
          try {
            const posted = await provider.postReviewComment(
              repo.full_name,
              {
                prNumber,
                commitSha: headSha,
                filePath: finding.filePath,
                line: finding.endLine,
                side: finding.side,
                bodyMd,
                patch: fileDiff?.patch ?? null,
              },
              credential,
              logger
            );

            await markCommentPosted(commentId, posted.externalCommentId, posted.createdAt);
          } catch (err) {
            logger.warn("Failed to post review comment to GitHub", {
              comment_id: commentId,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        } catch (err) {
          logger.warn("Failed to process review comment for finding", {
            review_run_id: runId,
            issue_id: issue.id,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      // 步骤 12: 更新 review_run 为 succeeded
      await updateReviewRun(runId, {
        status: "succeeded",
        finishedAt: new Date(),
        findingsCount: insertedIssues.length,
        analyzedFilesCount: diffs.length,
        summaryMd,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error("Review job failed", err instanceof Error ? err : new Error(errorMessage), {
        review_run_id: runId,
        repository_id: repositoryId,
        pr_number: prNumber,
      });

      try {
        await updateReviewRun(runId, {
          status: "failed",
          finishedAt: new Date(),
          errorMessage,
        });
      } catch (updateErr) {
        logger.warn("Failed to update review run status to failed", {
          review_run_id: runId,
          error: updateErr instanceof Error ? updateErr.message : String(updateErr),
        });
      }

      throw err;
    }
  } catch (err) {
    if (!runId) {
      logger.error(
        "Review job failed before run was created",
        err instanceof Error ? err : new Error(String(err)),
        {
          repository_id: repositoryId,
          pr_number: prNumber,
        }
      );
    }
    throw err;
  }
}
