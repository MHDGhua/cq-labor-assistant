import { adminForwardHeaders, requireAdminRequest } from "@/lib/admin-auth";

const backendUrl = process.env.BACKEND_URL ?? "http://127.0.0.1:8000";

export async function GET(request: Request) {
  const adminError = requireAdminRequest(request, "admin");
  if (adminError) {
    return adminError;
  }

  const url = new URL(request.url);
  const limit = url.searchParams.get("limit") ?? "12";

  try {
    const response = await fetch(`${backendUrl}/audit-logs?limit=${encodeURIComponent(limit)}`, {
      cache: "no-store",
      headers: adminForwardHeaders(request)
    });

    if (!response.ok) {
      throw new Error("audit backend unavailable");
    }

    const data = await response.json();
    return Response.json({ ...data, source: "backend" });
  } catch {
    return Response.json(
      {
        items: [],
        source: "unavailable",
        error: "审计日志暂不可用"
      },
      { status: 200 }
    );
  }
}
