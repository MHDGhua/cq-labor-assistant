import { adminForwardHeaders, requireAdminRequest } from "@/lib/admin-auth";

const backendUrl = process.env.BACKEND_URL ?? "http://127.0.0.1:8000";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const adminError = requireAdminRequest(request, "admin");
  if (adminError) {
    return adminError;
  }

  const { id } = await params;

  try {
    const response = await fetch(`${backendUrl}/cases/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: adminForwardHeaders(request)
    });

    if (!response.ok) {
      return Response.json({ error: "failed to delete case" }, { status: response.status });
    }

    return Response.json(await response.json());
  } catch {
    return Response.json({ error: "failed to delete case" }, { status: 502 });
  }
}
