import { adminForwardHeaders, requireAdminRequest } from "@/lib/admin-auth";

const backendUrl = process.env.BACKEND_URL ?? "http://127.0.0.1:8000";

export async function GET(request: Request) {
  const adminError = requireAdminRequest(request);
  if (adminError) {
    return adminError;
  }

  const url = new URL(request.url);
  const limit = url.searchParams.get("limit") ?? "10";

  try {
    const response = await fetch(`${backendUrl}/history?limit=${encodeURIComponent(limit)}`, {
      headers: adminForwardHeaders(request)
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: `backend history failed: ${response.status}` }));
      return Response.json(
        {
          items: [],
          source: "unavailable",
          error: body.error ?? `backend history failed: ${response.status}`
        },
        { status: 200 }
      );
    }

    const data = await response.json();
    return Response.json({ ...data, source: "backend" });
  } catch {
    return Response.json(
      {
        items: [],
        source: "unavailable",
        error: "历史服务暂不可用"
      },
      { status: 200 }
    );
  }
}
