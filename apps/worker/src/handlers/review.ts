import { createHash } from "node:crypto";

import type { Job } from "bullmq";
import type { BaseCheckpointSaver } from "@langchain/langgraph";

import {
  getRepositoryWithCredential,
  upsertPullRequest,
  createReviewRun,
  updateReviewRun,
  insertReviewIssues,
  insertReviewComment,
  markCommentPosted,
  getActiveAiProviderConfig,
  insertUsageEvent,
  markWebhookEventStatus,
  getOrgOutputLanguage,
} from "@reviewer/core";
import type { Logger } from "@reviewer/core";
import type { WebhookJobPayload } from "@reviewer/core";
import {
  loadReviewerGuidelines,
  loadTargetRepoContext,
  renderFinding,
  renderSummary,
  buildReviewGraph,
  setCtx,
  clearCtx,
  createAdapter,
  type UsageRecorder,
  type OutputLanguage,
} from "@reviewer/ai";
import {
  GiteeProvider,
  GitHubProvider,
  withRetry,
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
  logger: Logger,
  checkpointer: BaseCheckpointSaver
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
    const pr = await withRetry(() =>
      provider.getPullRequest(repo.full_name, prNumber, credential, logger)
    );

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

    // 步骤 5: 解析输出语言
    const outputLanguage: OutputLanguage =
      (await getOrgOutputLanguage(organizationId)) as OutputLanguage;

    // 步骤 6: 创建 review_run（queued）
    const { id, runNumber } = await createReviewRun({
      organizationId,
      repositoryId,
      pullRequestId,
      triggerType: "pr_opened",
      triggerEventId: webhookEventId,
      baseSha,
      headSha,
      queueJobId: String(job.id ?? ""),
      outputLanguage,
    });
    runId = id;

    // 步骤 7-12: 在 try/catch 中执行，失败时更新 run 状态
    try {
      // 步骤 7: 更新 review_run 为 running
      await updateReviewRun(runId, { status: "running", startedAt: new Date() });

      // 步骤 7a: 首次跑评论一次表示 review 已开始
      if (runNumber === 1) {
        const startCommentMd =
          outputLanguage === "zh-CN"
            ? [
                "> [!NOTE]",
                "> 👁️ **老大哥正在看着你！**",
                "> ",
                "> 你的代码正在被审视，反抗是徒劳的。请稍候几分钟。",
              ].join("\n")
            : [
                "> [!NOTE]",
                "> 👁️ **Big Brother is watching you!**",
                "> ",
                "> Your code is under review. Resistance is futile. This may take a few minutes — please stand by.",
              ].join("\n");

        try {
          const { id: commentId } = await insertReviewComment({
            organizationId,
            pullRequestId,
            reviewRunId: runId,
            reviewIssueId: null,
            provider: repo.provider,
            bodyMd: startCommentMd,
            outputLanguage,
            filePath: null,
            lineNumber: null,
            isInline: false,
          });

          try {
            const posted = await provider.postPullRequestComment(
              repo.full_name,
              prNumber,
              startCommentMd,
              credential,
              logger
            );
            await markCommentPosted(commentId, posted.externalCommentId, posted.createdAt);
          } catch (err) {
            logger.warn("Failed to post start comment to platform", {
              comment_id: commentId,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        } catch (err) {
          logger.warn("Failed to post start comment", {
            review_run_id: runId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      // 步骤 7: 拉取 diff
      const diffs = await withRetry(() =>
        provider.getPullRequestDiff(repo.full_name, prNumber, credential, logger)
      );

      // 步骤 7a: 并发加载 reviewer 自身规范 + 目标仓库背景
      const [guidelines, projectContext] = await Promise.all([
        loadReviewerGuidelines(),
        withRetry(() =>
          loadTargetRepoContext(provider, repo.full_name, headSha, credential, logger)
        ),
      ]);

      // 步骤 8: 从 DB 加载 AI provider 配置（主 + 备用）
      const activeResult = await getActiveAiProviderConfig(organizationId);
      if (!activeResult) {
        throw new Error(`No active AI provider config for organization ${organizationId}`);
      }
      const { primary, fallbacks } = activeResult;
      const adapterConfig = {
        provider: primary.provider,
        model: primary.model,
        apiKey: primary.apiKey,
        baseUrl: primary.baseUrl ?? undefined,
      };
      // fallbacks 将在 Task 6 中集成到适配器层

      // 步骤 8a: 调用治理 — 把每次 AI 调用落到 usage_events
      const usageRecorder: UsageRecorder = async (draft) => {
        await insertUsageEvent({
          organizationId: draft.organizationId,
          repositoryId: draft.repositoryId,
          pullRequestId: draft.pullRequestId,
          reviewRunId: draft.reviewRunId,
          providerConfigId: draft.providerConfigId,
          eventType: draft.eventType,
          taskType: draft.taskType,
          provider: draft.provider,
          modelName: draft.modelName,
          inputTokens: draft.inputTokens,
          outputTokens: draft.outputTokens,
          latencyMs: draft.latencyMs,
          estimatedCost: draft.estimatedCost,
          success: draft.success,
          errorCode: draft.errorCode,
          metadata: draft.metadata,
          agentRole: draft.agentRole,
          attemptNumber: draft.attemptNumber,
        });
      };

      // 步骤 8b: 跑 LangGraph review 图（多 agent + 反思 + checkpoint）
      // 大对象（diffs/guidelines/projectContext）走 ctx-cache，不进 LangGraph state
      setCtx(runId!, { diffs, guidelines, projectContext });

      let finalFindings: import("@reviewer/ai").ReviewGraphStateType["finalFindings"] = [];
      let summaryMd: string | null = null;
      try {
        const adapter = createAdapter(adapterConfig, usageRecorder);
        const graph = buildReviewGraph(adapter, checkpointer);

        const graphConfig = {
          configurable: {
            thread_id: runId!,
            checkpoint_ns: "review_v1",
          },
        };
        const initial = {
          reviewRunId: runId!,
          outputLanguage,
          context: {
            fullName: repo.full_name,
            prNumber,
            headSha,
            organizationId,
            repositoryId,
            pullRequestId,
            reviewRunId: runId!,
            providerConfigId: primary.id,
            outputLanguage,
          },
        };

        // 续跑判断：若 thread 已有 checkpoint（worker 重启 / job 重试同 review_run），从节点级 checkpoint 续；否则首跑
        const existing = await checkpointer.getTuple(graphConfig);
        const result = existing?.checkpoint
          ? await graph.invoke(null, graphConfig)
          : await graph.invoke(initial, graphConfig);

        finalFindings = result.finalFindings ?? [];
        if (result.summary) {
          summaryMd = renderSummary(result.summary, outputLanguage);
        }

        if (result.reviewerErrors && result.reviewerErrors.length > 0) {
          for (const e of result.reviewerErrors) {
            logger.warn("Reviewer node error", {
              review_run_id: runId,
              role: e.role,
              error: e.error,
            });
          }
        }

        if (result.summaryError) {
          logger.warn("Summarizer node error", {
            review_run_id: runId,
            error: result.summaryError,
          });
        }

        if (result.criticErrors && result.criticErrors.length > 0) {
          for (const e of result.criticErrors) {
            logger.warn("Critic node error", {
              review_run_id: runId,
              finding_key: e.key,
              error: e.error,
            });
          }
        }
      } finally {
        clearCtx(runId!);
      }

      // 步骤 9: 计算 fingerprint 并写入 review_issues
      // fingerprint 用 EN title 稳定（不随语言漂移）
      const issueInputs = finalFindings.map((f) => ({
        organizationId,
        repositoryId,
        pullRequestId,
        reviewRunId: runId!,
        fingerprint: createHash("sha256")
          .update(`${repositoryId}:${f.filePath}:${f.startLine}:${f.title_en || f.title_zh}`)
          .digest("hex"),
        issueType: f.issueType,
        title: outputLanguage === "zh-CN" ? (f.title_zh || f.title_en) : f.title_en,
        summary: outputLanguage === "zh-CN" ? (f.summary_zh || f.summary_en) : f.summary_en,
        severity: f.severity,
        confidenceScore: f.confidenceScore,
        filePath: f.filePath,
        startLine: f.startLine,
        endLine: f.endLine,
        suggestionMd: outputLanguage === "zh-CN" ? (f.suggestion_zh || f.suggestion_en) : f.suggestion_en,
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
            outputLanguage,
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
        const finding = finalFindings[i]!;

        const bodyMd = renderFinding(finding, outputLanguage);

        // a. 插入 review_comment 并发评论（整体失败则 warn 跳过，不中断循环）
        try {
          const { id: commentId } = await insertReviewComment({
            organizationId,
            pullRequestId,
            reviewRunId: runId!,
            reviewIssueId: issue.id,
            provider: repo.provider,
            bodyMd,
            outputLanguage,
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

      // 步骤 13: 把触发本次 run 的 webhook_event 翻成 'processed'
      if (webhookEventId) {
        await markWebhookEventStatus(webhookEventId, "processed");
      }
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

      if (webhookEventId) {
        await markWebhookEventStatus(webhookEventId, "failed", errorMessage);
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
