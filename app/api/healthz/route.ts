import type { HealthStatusResponse } from "@/lib/agents/types";

const backendUrl = process.env.BACKEND_URL ?? "http://127.0.0.1:8000";
const noStoreHeaders = { "Cache-Control": "no-store" };

export async function GET() {
  try {
    const response = await fetch(`${backendUrl}/healthz`, { cache: "no-store" });
    if (!response.ok) {
      return unavailableHealth();
    }

    const normalized = normalizeHealthPayload(await response.json().catch(() => null));
    if (!normalized) {
      return unavailableHealth();
    }

    return Response.json(normalized, { headers: noStoreHeaders });
  } catch {
    return unavailableHealth();
  }
}

function unavailableHealth() {
  return Response.json(
    {
      ok: false,
      source: "unavailable",
      checkedAt: new Date().toISOString(),
      status: "degraded",
      databaseReachable: false,
      caseCount: 0,
      activeKnowledgeDocCount: 0,
      feedbackCount: 0,
      auditLogCount: 0,
      providerMode: "local",
      model: "unavailable",
      apiKeyConfigured: false,
      databaseLabel: "unavailable",
      error: "生产健康检查暂不可用"
    } satisfies HealthStatusResponse,
    { status: 200, headers: noStoreHeaders }
  );
}

function normalizeHealthPayload(payload: unknown): HealthStatusResponse | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const data = payload as Record<string, unknown>;
  const status = data.status === "ok" ? "ok" : "degraded";
  const providerMode = data.providerMode === "deepseek" ? "deepseek" : "local";

  return {
    status,
    ok: data.ok === true && status === "ok",
    source: "backend",
    checkedAt: new Date().toISOString(),
    databaseReachable: data.databaseReachable === true,
    caseCount: numberValue(data.caseCount) ?? 0,
    activeKnowledgeDocCount: numberValue(data.activeKnowledgeDocCount) ?? 0,
    feedbackCount: numberValue(data.feedbackCount) ?? 0,
    auditLogCount: numberValue(data.auditLogCount) ?? 0,
    providerMode,
    model: stringValue(data.model) || "unknown",
    apiKeyConfigured: data.apiKeyConfigured === true,
    databaseLabel: stringValue(data.databaseLabel) || "unknown"
  };
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
