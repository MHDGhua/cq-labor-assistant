import { afterEach, describe, expect, it } from "vitest";
import {
  adminForwardHeaders,
  adminTokenHeader,
  requireAdminRequest,
  resolveAdminAccessLevel,
  resolveAdminRole
} from "../lib/admin-auth";

const originalAdminToken = process.env.ADMIN_TOKEN;
const originalAdminAdminToken = process.env.ADMIN_ADMIN_TOKEN;
const originalAdminViewerToken = process.env.ADMIN_VIEWER_TOKEN;
const originalEditorToken = process.env.ADMIN_EDITOR_TOKEN;
const originalViewToken = process.env.ADMIN_VIEW_TOKEN;

afterEach(() => {
  restoreEnv("ADMIN_TOKEN", originalAdminToken);
  restoreEnv("ADMIN_ADMIN_TOKEN", originalAdminAdminToken);
  restoreEnv("ADMIN_VIEWER_TOKEN", originalAdminViewerToken);
  restoreEnv("ADMIN_EDITOR_TOKEN", originalEditorToken);
  restoreEnv("ADMIN_VIEW_TOKEN", originalViewToken);
});

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
}

describe("admin auth helper", () => {
  it("rejects internal requests when ADMIN_TOKEN is not configured", async () => {
    delete process.env.ADMIN_TOKEN;
    delete process.env.ADMIN_ADMIN_TOKEN;
    delete process.env.ADMIN_VIEWER_TOKEN;
    delete process.env.ADMIN_EDITOR_TOKEN;
    delete process.env.ADMIN_VIEW_TOKEN;

    const response = requireAdminRequest(new Request("http://localhost/api/cases"));

    expect(response?.status).toBe(503);
    await expect(response?.json()).resolves.toEqual({ error: "admin token is not configured" });
  });

  it("rejects wrong tokens and accepts matching x-admin-token values", () => {
    process.env.ADMIN_TOKEN = "expected-token";

    const rejected = requireAdminRequest(
      new Request("http://localhost/api/cases", {
        headers: { [adminTokenHeader]: "wrong-token" },
      }),
    );
    const accepted = requireAdminRequest(
      new Request("http://localhost/api/cases", {
        headers: { [adminTokenHeader]: "expected-token" },
      }),
    );

    expect(rejected?.status).toBe(401);
    expect(accepted).toBeNull();
  });

  it("accepts bearer tokens and forwards admin headers to backend requests", () => {
    process.env.ADMIN_TOKEN = "bearer-token";
    const request = new Request("http://localhost/api/cases", {
      headers: { authorization: "Bearer bearer-token" },
    });

    expect(requireAdminRequest(request)).toBeNull();
    expect(adminForwardHeaders(request, { "Content-Type": "application/json" })).toEqual({
      "Content-Type": "application/json",
      [adminTokenHeader]: "bearer-token",
    });
  });

  it("allows viewer tokens for reads and rejects them for writes", () => {
    process.env.ADMIN_TOKEN = "write-token";
    process.env.ADMIN_VIEW_TOKEN = "read-token";
    const request = new Request("http://localhost/api/runtime", {
      headers: { [adminTokenHeader]: "read-token" },
    });

    expect(resolveAdminRole(request)).toBe("viewer");
    expect(resolveAdminAccessLevel(request)).toBe("read");
    expect(requireAdminRequest(request)).toBeNull();
    expect(requireAdminRequest(request, "write")?.status).toBe(401);
  });

  it("allows editor tokens for write-scoped requests", () => {
    process.env.ADMIN_TOKEN = "admin-token";
    process.env.ADMIN_EDITOR_TOKEN = "editor-token";

    const request = new Request("http://localhost/api/cases/import", {
      headers: { [adminTokenHeader]: "editor-token" },
    });

    expect(resolveAdminRole(request)).toBe("editor");
    expect(resolveAdminAccessLevel(request)).toBe("write");
    expect(requireAdminRequest(request, "write")).toBeNull();
  });

  it("recognizes admin-viewer compatibility aliases", () => {
    process.env.ADMIN_ADMIN_TOKEN = "admin-role-token";
    process.env.ADMIN_VIEWER_TOKEN = "viewer-role-token";

    const adminRequest = new Request("http://localhost/api/cases", {
      headers: { [adminTokenHeader]: "admin-role-token" },
    });
    const viewerRequest = new Request("http://localhost/api/cases", {
      headers: { [adminTokenHeader]: "viewer-role-token" },
    });

    expect(resolveAdminRole(adminRequest)).toBe("admin");
    expect(resolveAdminAccessLevel(adminRequest)).toBe("write");
    expect(requireAdminRequest(adminRequest, "write")).toBeNull();

    expect(resolveAdminRole(viewerRequest)).toBe("viewer");
    expect(resolveAdminAccessLevel(viewerRequest)).toBe("read");
    expect(requireAdminRequest(viewerRequest, "write")?.status).toBe(401);
  });
});
