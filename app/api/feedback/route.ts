import { enforceRateLimit } from "@/lib/rate-limit";

const backendUrl = process.env.BACKEND_URL ?? "http://127.0.0.1:8000";
const feedbackRateLimit = {
  scope: "api:feedback",
  limit: 10,
  windowMs: 60_000
} as const;

function jsonError(status: number, error: string, extra?: Record<string, unknown>) {
  return Response.json({ error, ...extra }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const rateLimitResult = enforceRateLimit(request, feedbackRateLimit);
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

  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload.helpful !== "boolean") {
    return jsonError(400, "invalid feedback payload");
  }

  const comment =
    typeof payload.comment === "string"
      ? payload.comment.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 500)
      : undefined;

  try {
    const response = await fetch(`${backendUrl}/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        analysisId: typeof payload.analysisId === "string" ? payload.analysisId : undefined,
        helpful: payload.helpful,
        comment
      })
    });

    if (!response.ok) {
      throw new Error("feedback backend unavailable");
    }

    return Response.json({ created: true });
  } catch (error) {
    console.error("feedback backend error", error);
    return jsonError(502, "feedback service unavailable");
  }
}
