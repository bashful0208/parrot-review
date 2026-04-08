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
} from "@reviewer/core";
import type { Logger } from "@reviewer/core";
import type { WebhookJobPayload } from "@reviewer/core";
import { generateReviewFindings, loadAiProviderConfig } from "@reviewer/ai";
import { GitHubProvider } from "@reviewer/git";

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
    const credential = { type: "github_pat" as const, token: repo.credentialToken };

    // 步骤 3: 拉取 PR 详情
    const provider = new GitHubProvider();
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

      // 步骤 8: 调用 AI
      const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
      if (!ANTHROPIC_API_KEY) {
        throw new Error("ANTHROPIC_API_KEY is not set");
      }
      const aiConfig = loadAiProviderConfig();
      const result = await generateReviewFindings(
        { fullName: repo.full_name, prNumber, headSha, diffs },
        aiConfig,
        ANTHROPIC_API_KEY
      );

      // 步骤 9: 计算 fingerprint 并写入 review_issues
      const issueInputs = result.findings.map((f) => ({
        organizationId,
        repositoryId,
        pullRequestId,
        reviewRunId: runId!,
        fingerprint: createHash("sha256")
          .update(`${repositoryId}:${f.filePath}:${f.startLine}:${f.title}`)
          .digest("hex"),
        issueType: f.issueType,
        title: f.title,
        summary: f.summary,
        severity: f.severity,
        confidenceScore: f.confidenceScore,
        filePath: f.filePath,
        startLine: f.startLine,
        endLine: f.endLine,
        suggestionMd: f.suggestion,
      }));
      const insertedIssues = await insertReviewIssues(issueInputs);

      // 步骤 10: 对每条 issue 回写 GitHub 评论
      for (let i = 0; i < insertedIssues.length; i++) {
        const issue = insertedIssues[i]!;
        const finding = result.findings[i]!;

        const bodyMd = `**${finding.title}** (${finding.severity})\n\n${finding.summary}\n\n**Suggestion:** ${finding.suggestion}`;

        // a. 插入 review_comment 并发评论（整体失败则 warn 跳过，不中断循环）
        try {
          const { id: commentId } = await insertReviewComment({
            organizationId,
            pullRequestId,
            reviewRunId: runId!,
            reviewIssueId: issue.id,
            provider: "github",
            bodyMd,
            filePath: finding.filePath,
            lineNumber: finding.endLine,
            isInline: true,
          });

          // b. 调用 GitHub API 发评论（失败不抛，只 log）
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

      // 步骤 11: 更新 review_run 为 succeeded
      await updateReviewRun(runId, {
        status: "succeeded",
        finishedAt: new Date(),
        findingsCount: insertedIssues.length,
        analyzedFilesCount: diffs.length,
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
