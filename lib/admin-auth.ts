export const adminTokenHeader = "x-admin-token";
export type AdminRole = "viewer" | "editor" | "admin";
export type AdminAccessLevel = "read" | "write";
export type MinimumAccessLevel = AdminAccessLevel | AdminRole;

const roleRank: Record<AdminRole, number> = {
  viewer: 10,
  editor: 20,
  admin: 30
};

export function requireAdminRequest(request: Request, minimumAccess: MinimumAccessLevel = "read"): Response | null {
  if (!hasConfiguredToken(minimumAccess)) {
    return Response.json({ error: "admin token is not configured" }, { status: 503 });
  }

  const role = resolveAdminRole(request);
  if (!role || !roleMeetsRequirement(role, minimumAccess)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  return null;
}

export function resolveAdminAccessLevel(request: Request): AdminAccessLevel | null {
  const role = resolveAdminRole(request);
  if (!role) {
    return null;
  }

  return role === "viewer" ? "read" : "write";
}

export function resolveAdminRole(request: Request): AdminRole | null {
  const providedToken = getAdminTokenFromRequest(request);
  if (!providedToken) {
    return null;
  }

  for (const [role, token] of configuredRoleTokens()) {
    if (timingSafeEqual(providedToken, token)) {
      return role;
    }
  }

  return null;
}

export function adminForwardHeaders(
  request: Request,
  headers: Record<string, string> = {}
): Record<string, string> {
  const token = getAdminTokenFromRequest(request);
  return token ? { ...headers, [adminTokenHeader]: token } : headers;
}

function getAdminTokenFromRequest(request: Request): string | null {
  const headerToken = request.headers.get(adminTokenHeader)?.trim();
  if (headerToken) {
    return headerToken;
  }

  const authorization = request.headers.get("authorization")?.trim();
  if (!authorization) {
    return null;
  }

  const [scheme, token] = authorization.split(/\s+/, 2);
  return scheme.toLowerCase() === "bearer" && token ? token.trim() : null;
}

function hasConfiguredToken(minimumAccess: MinimumAccessLevel): boolean {
  return configuredRoleTokens().some(([role]) => roleMeetsRequirement(role, minimumAccess));
}

function configuredRoleTokens(): Array<[AdminRole, string]> {
  return [
    ["admin", process.env.ADMIN_ADMIN_TOKEN?.trim() ?? ""],
    ["admin", process.env.ADMIN_TOKEN?.trim() ?? ""],
    ["editor", process.env.ADMIN_EDITOR_TOKEN?.trim() ?? ""],
    ["viewer", process.env.ADMIN_VIEWER_TOKEN?.trim() ?? ""],
    ["viewer", process.env.ADMIN_VIEW_TOKEN?.trim() ?? ""]
  ].filter((item): item is [AdminRole, string] => Boolean(item[1]));
}

function roleMeetsRequirement(role: AdminRole, minimumAccess: MinimumAccessLevel): boolean {
  return roleRank[role] >= roleRank[minimumRoleForAccess(minimumAccess)];
}

function minimumRoleForAccess(minimumAccess: MinimumAccessLevel): AdminRole {
  if (minimumAccess === "read" || minimumAccess === "viewer") {
    return "viewer";
  }

  if (minimumAccess === "write" || minimumAccess === "editor") {
    return "editor";
  }

  return "admin";
}

function timingSafeEqual(provided: string, expected: string): boolean {
  const length = Math.max(provided.length, expected.length);
  let diff = provided.length ^ expected.length;

  for (let index = 0; index < length; index += 1) {
    diff |= (provided.charCodeAt(index) || 0) ^ (expected.charCodeAt(index) || 0);
  }

  return diff === 0;
}
