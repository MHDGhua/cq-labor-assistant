import { analyzeLaborCase, toPublicAnalysisResponse } from "@/lib/agents";
import type { AnalysisResult, PublicAnalysisResponse } from "@/lib/agents/types";
import { enforceRateLimit } from "@/lib/rate-limit";
import { LRUCache, hashKey } from "@/lib/utils/lru-cache";

const backendUrl = process.env.BACKEND_URL ?? "http://127.0.0.1:8000";
const analyzeRateLimit = {
  scope: "api:analyze",
  limit: 10,
  windowMs: 60_000
} as const;

const cache = new LRUCache<PublicAnalysisResponse>(100, 10 * 60 * 1000);

function jsonError(status: number, error: string, extra?: Record<string, unknown>) {
  return Response.json({ error, ...extra }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const rateLimitResult = enforceRateLimit(request, analyzeRateLimit);
  if (!rateLimitResult.allowed) {
    return Response.json(
      {
        error: "rate limit exceeded",
        retryAfterSeconds: rateLimitResult.retryAfterSeconds,
        limit: rateLimitResult.limit,
        resetAt: rateLimitResult.resetAt
      },
      {
        status: 429,
        headers: {
          "Cache-Control": "no-store",
          "Retry-After": String(rateLimitResult.retryAfterSeconds)
        }
      }
    );
  }

  const body = (await request.json().catch(() => null)) as { narrative?: string } | null;
  const narrative = body?.narrative?.replace(/[\u0000-\u001f]/g, "").trim();

  if (!narrative) {
    return jsonError(400, "narrative is required");
  }

  if (narrative.length > 2000) {
    return jsonError(400, "narrative is too long");
  }

  const cacheKey = hashKey(narrative);
  const cached = cache.get(cacheKey);
  if (cached) {
    return Response.json(cached, { headers: { "X-Cache": "HIT" } });
  }

  try {
    const response = await fetch(`${backendUrl}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ narrative })
    });

    if (!response.ok) {
      throw new Error(`backend analyze failed: ${response.status}`);
    }

    const data = (await response.json()) as AnalysisResult;
    const publicResult = toPublicAnalysisResponse(data);
    cache.set(cacheKey, publicResult);
    return Response.json(publicResult, { headers: { "X-Cache": "MISS" } });
  } catch (error) {
    console.error("analyze backend fallback", error);
    const result = analyzeLaborCase({ narrative });
    const publicResult = toPublicAnalysisResponse(result);
    const finalResult = { ...publicResult, analysisId: crypto.randomUUID() };
    cache.set(cacheKey, finalResult);
    return Response.json(finalResult, { headers: { "X-Cache": "MISS" } });
  }
}
