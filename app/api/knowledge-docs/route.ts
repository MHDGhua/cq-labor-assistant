import { knowledgeDocs } from "@/lib/data/knowledge_docs";
import { adminForwardHeaders, requireAdminRequest } from "@/lib/admin-auth";

const backendUrl = process.env.BACKEND_URL ?? "http://127.0.0.1:8000";

export async function GET(request: Request) {
  const adminError = requireAdminRequest(request);
  if (adminError) {
    return adminError;
  }

  const url = new URL(request.url);
  const params = new URLSearchParams({
    query: url.searchParams.get("query") ?? "",
    category: url.searchParams.get("category") ?? "all",
    region: url.searchParams.get("region") ?? "all",
    active: url.searchParams.get("active") ?? "all"
  });

  try {
    const response = await fetch(`${backendUrl}/knowledge-docs?${params.toString()}`, {
      headers: adminForwardHeaders(request)
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403 || response.status === 503) {
        return Response.json(await response.json().catch(() => ({ error: "unauthorized" })), {
          status: response.status
        });
      }
      throw new Error(`backend knowledge docs failed: ${response.status}`);
    }

    const data = (await response.json()) as { docs: unknown[] };
    return Response.json({ ...data, source: "backend" });
  } catch {
    return Response.json({ docs: knowledgeDocs, source: "local" });
  }
}

export async function POST(request: Request) {
  const adminError = requireAdminRequest(request, "write");
  if (adminError) {
    return adminError;
  }

  try {
    const payload = await request.json();
    const response = await fetch(`${backendUrl}/knowledge-docs/import`, {
      method: "POST",
      headers: adminForwardHeaders(request, { "Content-Type": "application/json" }),
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      return Response.json({ error: "failed to import knowledge docs" }, { status: response.status });
    }

    return Response.json(await response.json());
  } catch {
    return Response.json({ error: "failed to import knowledge docs" }, { status: 502 });
  }
}
