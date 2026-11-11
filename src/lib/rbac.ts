export type UserRole = "viewer" | "creator" | "admin" | "staff";

export type SessionUser = {
  id?: string;
  role?: UserRole | string;
};

export type SessionLike = {
  user?: SessionUser | null;
} | null;

const ADMIN_ROLES = new Set(["admin", "staff"]);

export function canAccessAdmin(user: SessionUser | null | undefined): boolean {
  if (!user?.role) return false;
  return ADMIN_ROLES.has(user.role);
}

export function requireRole(
  session: SessionLike,
  roles: Array<SessionUser["role"]>,
): boolean {
  const role = session?.user?.role;
  if (!role) return false;
  return roles.includes(role);
}
