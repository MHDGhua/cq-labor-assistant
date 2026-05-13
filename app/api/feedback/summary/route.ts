import { adminForwardHeaders, requireAdminRequest } from "@/lib/admin-auth";

const backendUrl = process.env.BACKEND_URL ?? "http://127.0.0.1:8000";

export async function GET(request: Request) {
  const adminError = requireAdminRequest(request);
  if (adminError) {
    return adminError;
  }

  try {
    const response = await fetch(`${backendUrl}/feedback/summary`, {
      cache: "no-store",
      headers: adminForwardHeaders(request)
    });

    if (!response.ok) {
      throw new Error("feedback summary backend unavailable");
    }

    const data = await response.json();
    return Response.json({ ...data, source: "backend" });
  } catch {
    return Response.json(
      {
        total: 0,
        helpfulCount: 0,
        unhelpfulCount: 0,
        helpfulRate: 0,
        recentItems: [],
        source: "unavailable",
        error: "反馈统计暂不可用"
      },
      { status: 200 }
    );
  }
}
