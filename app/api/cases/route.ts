import { localCases } from "@/lib/data/cases";
import { adminForwardHeaders, requireAdminRequest } from "@/lib/admin-auth";

const backendUrl = process.env.BACKEND_URL ?? "http://127.0.0.1:8000";

export async function GET(request: Request) {
  const adminError = requireAdminRequest(request);
  if (adminError) {
    return adminError;
  }

  const url = new URL(request.url);
  const query = url.searchParams.get("query") ?? "";
  const scenario = url.searchParams.get("scenario") ?? "all";

  try {
    const response = await fetch(
      `${backendUrl}/cases?query=${encodeURIComponent(query)}&scenario=${encodeURIComponent(scenario)}`,
      { headers: adminForwardHeaders(request) }
    );

    if (!response.ok) {
      if (response.status === 401 || response.status === 403 || response.status === 503) {
        return Response.json(await response.json().catch(() => ({ error: "unauthorized" })), {
          status: response.status
        });
      }
      throw new Error(`backend cases failed: ${response.status}`);
    }

    const data = (await response.json()) as { cases: unknown[] };
    return Response.json({ ...data, source: "backend" });
  } catch {
    const cases = localCases.filter((item) => {
      const haystack = `${item.title} ${item.summary} ${item.district} ${item.tags.join(" ")}`.toLowerCase();
      const queryOk = !query || haystack.includes(query.toLowerCase());
      const scenarioOk = scenario === "all" || item.scenario === scenario;
      return queryOk && scenarioOk;
    });

    return Response.json({ cases, source: "local" });
  }
}

export async function POST(request: Request) {
  const adminError = requireAdminRequest(request, "write");
  if (adminError) {
    return adminError;
  }

  try {
    const payload = await request.json();
    const response = await fetch(`${backendUrl}/cases/import`, {
      method: "POST",
      headers: adminForwardHeaders(request, { "Content-Type": "application/json" }),
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      return Response.json({ error: "failed to import cases" }, { status: response.status });
    }

    return Response.json(await response.json());
  } catch (error) {
    return Response.json({ error: "failed to import cases" }, { status: 502 });
  }
}
