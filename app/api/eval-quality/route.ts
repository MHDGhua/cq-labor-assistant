import { readFile } from "node:fs/promises";
import path from "node:path";
import { requireAdminRequest } from "@/lib/admin-auth";
import type { EvalQualityResponse } from "@/lib/agents/types";

const noStoreHeaders = { "Cache-Control": "no-store" };
const reportsDir = path.join(process.cwd(), "evals", "reports");

export async function GET(request: Request) {
  const adminError = requireAdminRequest(request);
  if (adminError) {
    return adminError;
  }

  try {
    const [qualityGate, reviewQueue, productionEvalReport, productionReviewQueueReport, shadowGate, adaptedInputReview, releaseCheck] = await Promise.all([
      readJson(path.join(reportsDir, "quality-gate-latest.json")),
      readJson(path.join(reportsDir, "review-queue-latest.json")),
      readJson(path.join(reportsDir, "production-eval-latest.json")),
      readJson(path.join(reportsDir, "production-review-queue-latest.json")),
      readJson(path.join(reportsDir, "model-shadow-gate-latest.json")),
      readJson(path.join(reportsDir, "adapted-input-review-latest.json")),
      readJson(path.join(reportsDir, "release-check-latest.json")),
    ]);

    if (!qualityGate) {
      return unavailableQuality("质量门禁报告不存在，请先运行 npm run evals:quality。");
    }

    return Response.json(
      {
        source: "backend",
        qualityGate: normalizeQualityGate(qualityGate),
        reviewQueue: normalizeReviewQueue(reviewQueue),
        productionEval: normalizeProductionEval(productionEvalReport ?? qualityGate),
        productionReviewQueue: normalizeProductionReviewQueue(productionReviewQueueReport ?? reviewQueue),
        shadowGate: normalizeShadowGate(shadowGate),
        adaptedInputReview: normalizeAdaptedInputReview(adaptedInputReview),
        releaseCheck: normalizeReleaseCheck(releaseCheck),
      } satisfies EvalQualityResponse,
      { headers: noStoreHeaders }
    );
  } catch {
    return unavailableQuality("质量门禁报告暂不可用");
  }
}

async function readJson(filePath: string) {
  try {
    const parsed = JSON.parse(await readFile(filePath, "utf-8"));
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function unavailableQuality(error: string) {
  return Response.json(
    {
      source: "unavailable",
      error,
      qualityGate: null,
      reviewQueue: [],
      productionEval: null,
      productionReviewQueue: [],
      shadowGate: null,
      adaptedInputReview: null,
      releaseCheck: null,
    } satisfies EvalQualityResponse,
    { status: 200, headers: noStoreHeaders }
  );
}

function normalizeQualityGate(payload: Record<string, unknown>) {
  const summary = objectValue(payload.summary);
  return {
    generatedAt: stringValue(payload.generatedAt) || "",
    status: stringValue(payload.status) || "unknown",
    provider: stringValue(payload.provider) || "unknown",
    passRate: numberValue(summary.passRate) ?? 0,
    passed: numberValue(summary.passed) ?? 0,
    total: numberValue(summary.total) ?? 0,
    failed: numberValue(summary.failed) ?? 0,
    reviewQueueCount: numberValue(summary.reviewQueueCount) ?? 0,
    dimensionFailures: recordOfNumbers(summary.dimensionFailures),
  };
}

function normalizeReviewQueue(payload: Record<string, unknown> | null) {
  const raw = Array.isArray(payload) ? payload : [];
  return raw.slice(0, 12).map((item) => {
    const row = objectValue(item);
    return {
      caseId: stringValue(row.caseId) || "unknown",
      priority: stringValue(row.priority) || "medium",
      category: stringValue(row.category) || "general",
      recommendation: stringValue(row.recommendation) || "manual review",
      failedDimensions: arrayOfStrings(row.failedDimensions),
      qualityFlags: arrayOfStrings(row.qualityFlags),
    };
  });
}

function normalizeProductionEval(payload: Record<string, unknown> | null, reviewQueuePayload: Record<string, unknown> | null = null) {
  if (!payload) {
    return null;
  }
  const summary = objectValue(payload.summary);
  const productionQueue = normalizeProductionReviewQueue(reviewQueuePayload);
  const lowConfidenceCount = productionQueue.filter((item) =>
    hasLowConfidenceSignal([item.category, ...item.failedDimensions, ...item.handoffReasons])
  ).length;
  return {
    generatedAt: stringValue(payload.generatedAt) || "",
    status: stringValue(payload.status) || "unknown",
    provider: stringValue(payload.provider) || "unknown",
    passRate: numberValue(summary.passRate) ?? 0,
    passed: numberValue(summary.passed) ?? 0,
    total: numberValue(summary.total) ?? 0,
    failed: numberValue(summary.failed) ?? 0,
    lowConfidenceCount: numberValue(summary.lowConfidenceCount) ?? lowConfidenceCount,
    handoffCount: numberValue(summary.handoffCount) ?? productionQueue.filter((item) => item.handoffRequired).length,
    reviewQueueCount: numberValue(summary.reviewQueueCount) ?? productionQueue.length,
    dimensionFailures: recordOfNumbers(summary.dimensionFailures),
  };
}

function normalizeProductionReviewQueue(payload: Record<string, unknown> | null) {
  const raw = Array.isArray(payload) ? payload : [];
  return raw.slice(0, 12).map((item) => {
    const row = objectValue(item);
    const failedDimensions = arrayOfStrings(row.failedDimensions);
    const qualityFlags = arrayOfStrings(row.qualityFlags);
    const explicitReasons = arrayOfStrings(row.handoffReasons);
    const handoffReasons = explicitReasons.length ? explicitReasons : Array.from(new Set([...failedDimensions, ...qualityFlags]));
    return {
      caseId: stringValue(row.caseId) || "unknown",
      priority: stringValue(row.priority) || "medium",
      category: stringValue(row.category) || "general",
      recommendation: stringValue(row.recommendation) || "manual review",
      failedDimensions,
      handoffRequired: Boolean(row.handoffRequired) || handoffReasons.length > 0,
      handoffReasons,
    };
  });
}

function normalizeShadowGate(payload: Record<string, unknown> | null) {
  if (!payload) {
    return null;
  }
  const qualityGate = objectValue(payload.qualityGate);
  const deepseekShadow = objectValue(payload.deepseekShadow);
  return {
    generatedAt: stringValue(payload.generatedAt) || "",
    status: stringValue(payload.status) || "unknown",
    deepseekConfigured: Boolean(payload.deepseekConfigured),
    qualityGateStatus: stringValue(qualityGate.status) || "unknown",
    deepseekStatus: stringValue(deepseekShadow.status) || "unknown",
    differenceCount: numberValue(deepseekShadow.differenceCount) ?? 0,
    warningCount: numberValue(deepseekShadow.warningCount) ?? 0,
    failureCount: numberValue(deepseekShadow.failureCount) ?? 0,
  };
}

function normalizeAdaptedInputReview(payload: Record<string, unknown> | null) {
  if (!payload) {
    return null;
  }
  const summary = objectValue(payload.summary);
  const reviewQueue = Array.isArray(payload.reviewQueue) ? payload.reviewQueue : [];
  return {
    generatedAt: stringValue(payload.generatedAt) || "",
    status: stringValue(payload.status) || "unknown",
    summary: {
      generatedAt: stringValue(payload.generatedAt) || "",
      status: stringValue(payload.status) || "unknown",
      total: numberValue(summary.total) ?? 0,
      safeCount: numberValue(summary.safeCount) ?? 0,
      warningCount: numberValue(summary.warningCount) ?? 0,
      failureCount: numberValue(summary.failureCount) ?? 0,
      passRate: numberValue(summary.passRate) ?? 0,
      reviewQueueCount: numberValue(summary.reviewQueueCount) ?? 0,
      scenarioCounts: recordOfNumbers(summary.scenarioCounts),
      categoryCounts: recordOfNumbers(summary.categoryCounts),
      warningCounts: recordOfNumbers(summary.warningCounts),
      failureCounts: recordOfNumbers(summary.failureCounts),
    },
    reviewQueue: reviewQueue.slice(0, 12).map((item) => {
      const row = objectValue(item);
      return {
        caseId: stringValue(row.caseId) || "unknown",
        sourceId: stringValue(row.sourceId) || "unknown",
        sourceCaseTitle: stringValue(row.sourceCaseTitle) || "unknown",
        category: stringValue(row.category) || "general",
        scenarioLabel: stringValue(row.scenarioLabel) || "未知",
        priority: stringValue(row.priority) || "medium",
        recommendation: stringValue(row.recommendation) || "manual review",
        warnings: arrayOfStrings(row.warnings),
        failures: arrayOfStrings(row.failures),
        qualityFlags: arrayOfStrings(row.qualityFlags),
      };
    }),
  };
}

function normalizeReleaseCheck(payload: Record<string, unknown> | null) {
  if (!payload) {
    return null;
  }
  const checks = Array.isArray(payload.checks) ? payload.checks : [];
  const normalizedChecks = checks.map((item) => objectValue(item));
  const failedChecks = normalizedChecks
    .filter((item) => stringValue(item.status) !== "passed")
    .map((item) => stringValue(item.name) || "unknown");
  const secretScan = objectValue(payload.secretScan);
  return {
    generatedAt: stringValue(payload.generatedAt) || "",
    status: stringValue(payload.status) || "unknown",
    durationSeconds: numberValue(payload.durationSeconds) ?? 0,
    passedCount: normalizedChecks.length - failedChecks.length,
    totalCount: normalizedChecks.length,
    failedChecks,
    secretScanPassed: secretScan.passed === true,
  };
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function arrayOfStrings(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function hasLowConfidenceSignal(values: string[]) {
  return values.some((value) => /低置信|未识别|缺少|missing|unknown|follow_up/i.test(value));
}

function recordOfNumbers(value: unknown) {
  const record = objectValue(value);
  return Object.fromEntries(
    Object.entries(record)
      .map(([key, item]) => [key, numberValue(item)])
      .filter((entry): entry is [string, number] => typeof entry[1] === "number")
  );
}
