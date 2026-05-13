import { adminForwardHeaders, requireAdminRequest, resolveAdminRole } from "@/lib/admin-auth";
import type { RuntimeStatusResponse } from "@/lib/agents/types";

const backendUrl = process.env.BACKEND_URL ?? "http://127.0.0.1:8000";
const noStoreHeaders = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const adminError = requireAdminRequest(request);
  if (adminError) {
    return adminError;
  }

  try {
    const response = await fetch(`${backendUrl}/runtime`, {
      cache: "no-store",
      headers: adminForwardHeaders(request)
    });

    if (!response.ok) {
      return unavailableRuntime();
    }

    const data = await response.json();
    const normalized = normalizeRuntimePayload(data, resolveAdminRole(request));
    if (!normalized) {
      return unavailableRuntime();
    }

    return Response.json(normalized, { headers: noStoreHeaders });
  } catch {
    return unavailableRuntime();
  }
}

function unavailableRuntime() {
  return Response.json(
    {
      source: "unavailable",
      error: "运行状态服务暂不可用"
    },
    { status: 200, headers: noStoreHeaders }
  );
}

function normalizeRuntimePayload(payload: unknown, accessRole: ReturnType<typeof resolveAdminRole>): RuntimeStatusResponse | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const data = payload as Record<string, unknown>;
  const providerMode = data.providerMode === "deepseek" ? "deepseek" : "local";
  const model = stringValue(data.model);
  const timeoutSeconds = numberValue(data.timeoutSeconds);
  const agentLabels = extractAgentLabels(data).slice(0, 3);

  if (!model || timeoutSeconds === null || !agentLabels.length) {
    return null;
  }

  return {
    source: "backend",
    providerMode,
    model,
    reasoningEffort: stringValue(data.reasoningEffort) || "unknown",
    tracingEnabled: Boolean(data.tracingEnabled),
    accessRole: normalizeRole(data.accessRole) ?? accessRole ?? undefined,
    accessLevel: data.accessLevel === "read" ? "read" : "write",
    role: normalizeRole(data.role) ?? normalizeRole(data.accessRole) ?? accessRole ?? undefined,
    capabilities: normalizeCapabilities(data.capabilities),
    timeoutSeconds,
    apiKeyConfigured: Boolean(data.apiKeyConfigured),
    localFallbackEnabled: booleanValue(data.localFallbackEnabled) ?? booleanValue(data.localFallback) ?? providerMode === "local",
    agentCount: numberValue(data.agentCount) ?? agentLabels.length,
    agentLabels,
    database: stringValue(data.database) || undefined
  };
}

function normalizeRole(value: unknown) {
  return value === "viewer" || value === "editor" || value === "admin" ? value : null;
}

function normalizeCapabilities(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const capabilities = value.filter(
    (item): item is "read" | "write" | "delete" | "audit" =>
      item === "read" || item === "write" || item === "delete" || item === "audit"
  );
  return capabilities.length ? capabilities : undefined;
}

function extractAgentLabels(data: Record<string, unknown>) {
  if (Array.isArray(data.agentLabels)) {
    return data.agentLabels.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  }

  if (!Array.isArray(data.agents)) {
    return [];
  }

  return data.agents
    .map((item) => (item && typeof item === "object" ? stringValue((item as Record<string, unknown>).label) : null))
    .filter((item): item is string => Boolean(item));
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

function booleanValue(value: unknown) {
  return typeof value === "boolean" ? value : null;
}
