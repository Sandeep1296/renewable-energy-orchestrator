import type { Request, Response, NextFunction } from 'express';

/**
 * Clerk auth with organization Roles & Permissions.
 * Permission matrix (deny-by-default; unknown roles get nothing):
 *   org:admin              → config:edit, hitl:approve, dispatch:run
 *   org:operator (custom)  → hitl:approve, dispatch:run
 *   org:member             → hitl:approve, dispatch:run
 *   org:viewer (custom)    → read-only
 * Custom Permissions from JWT claims also grant (org:config:edit,
 * org:dispatch:approve, org:dispatch:run).
 * Without CLERK_SECRET_KEY everything passes through as local-operator (demo mode).
 */

export type OrgRole = string; // 'admin' | 'operator' | 'member' | 'viewer' | custom

export const ROLE_PERMISSIONS: Record<string, string[]> = {
  admin: ['config:edit', 'hitl:approve', 'dispatch:run'],
  operator: ['hitl:approve', 'dispatch:run'],
  member: ['hitl:approve', 'dispatch:run'],
  viewer: [],
};

const CUSTOM_PERM_MAP: Record<string, string> = {
  'org:config:edit': 'config:edit',
  'org:dispatch:approve': 'hitl:approve',
  'org:dispatch:run': 'dispatch:run',
};

export function clerkEnabled(): boolean {
  return Boolean(process.env.CLERK_SECRET_KEY);
}

/** Attaches a default identity; route guards upgrade it after verification. */
export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  if (!(req as any).authUserId) {
    (req as any).authUserId = (req.headers['x-operator-id'] as string) || 'local-operator';
    (req as any).authRole = 'member';
    (req as any).authOrgId = null;
  }
  next();
}

/** Pure: derive org role from a verified Clerk session JWT. Unit-testable.
 *  Clerk puts the active organization's role in the `org_role` claim
 *  (e.g. "org:admin"); it is present only after the user activates an org. */
export function roleFromClaims(payload: any): { role: OrgRole | null; orgId: string | null; userId: string | null } {
  if (!payload || typeof payload !== 'object') return { role: null, orgId: null, userId: null };
  const raw = payload.org_role ?? payload.orgRole ?? null;
  const role = raw == null || raw === '' ? null : (String(raw).startsWith('org:') ? String(raw).slice(4) : String(raw));
  const orgId = payload.org_id ?? payload.orgId ?? null;
  const userId = payload.sub ?? null;
  return {
    role,
    orgId: orgId ? String(orgId) : null,
    userId: userId ? String(userId) : null,
  };
}

/** Best-effort identity: verify the token when present, never reject.
 *  Used on open compute routes (orchestrate, ask-agent) so audit logs carry
 *  the real operator instead of local-operator. */
export async function attachIdentityIfPresent(req: Request): Promise<void> {
  if (!clerkEnabled()) return;
  try {
    const { verifyToken } = await import('@clerk/express');
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) return;
    const payload: any = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY! });
    const { role, orgId, userId } = roleFromClaims(payload);
    (req as any).authUserId = userId || 'clerk-user';
    (req as any).authRole = role;
    (req as any).authOrgId = orgId;
    (req as any).authPermissions = permissionsFor(payload);
  } catch {
    /* keep default identity; route stays open */
  }
}

/** Effective app permissions for a verified JWT: custom-permission grants + role matrix. */
export function permissionsFor(payload: any): string[] {
  const perms = new Set<string>();
  const rawPerms = payload?.org_permissions ?? payload?.orgPermissions ?? [];
  (Array.isArray(rawPerms) ? rawPerms : []).forEach((p) => {
    const mapped = CUSTOM_PERM_MAP[String(p)];
    if (mapped) perms.add(mapped);
  });
  const { role } = roleFromClaims(payload);
  (ROLE_PERMISSIONS[role || ''] || []).forEach((p) => perms.add(p));
  return [...perms];
}

/** Require one app permission (deny-by-default when Clerk is enforced). */
export function requirePermIfConfigured(perm: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!clerkEnabled()) {
      (req as any).authUserId = (req.headers['x-operator-id'] as string) || 'local-operator';
      (req as any).authRole = 'admin';
      (req as any).authOrgId = null;
      (req as any).authPermissions = ['config:edit', 'hitl:approve', 'dispatch:run'];
      return next();
    }
    try {
      const { verifyToken } = await import('@clerk/express');
      const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      if (!token) {
        return res.status(401).json({ error: 'Login required. Sign in with email, select your organization, then retry.' });
      }
      const payload: any = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY! });
      const { role, orgId, userId } = roleFromClaims(payload);
      const perms = permissionsFor(payload);
      if (!perms.includes(perm)) {
        return res.status(403).json({
          error: `Forbidden: requires '${perm}' (your role: ${role ? `org:${role}` : 'none — activate your organization so the token carries a role'}).`,
        });
      }
      (req as any).authUserId = userId || 'clerk-user';
      (req as any).authRole = role;
      (req as any).authOrgId = orgId;
      (req as any).authPermissions = perms;
      next();
    } catch (e: any) {
      return res.status(e?.status === 403 ? 403 : 401).json({ error: `Clerk verification failed: ${e?.message || e}` });
    }
  };
}

function cleanHeader(v: unknown, max = 120): string | null {
  const s = String(v || '').trim();
  if (!s) return null;
  return s.replace(/[\r\n\t]+/g, ' ').slice(0, max);
}

/**
 * Who to blame in the audit ledger.
 * - Enforced mode: the verified Clerk identity (+role) wins; extra claimed
 *   details are appended only if they add information.
 * - Demo/local mode: self-asserted X-Operator-* headers from the signed-in
 *   Clerk client (or operator id), explicitly tagged [unverified] — audit
 *   attribution, never authorization.
 */
export function actorOf(req: Request): string {
  const verifiedId = (req as any).authUserId as string | undefined;
  const verifiedRole = (req as any).authRole as string | undefined;
  const h = req.headers as any;
  const email = cleanHeader(h['x-operator-email']);
  const name = cleanHeader(h['x-operator-name']);
  const claimedId = cleanHeader(h['x-operator-id']);
  const claimedRole = cleanHeader(h['x-operator-role']);
  const who = [name, email].filter(Boolean).join(' ') || claimedId || '';
  if (verifiedId && verifiedId !== 'local-operator') {
    const role = verifiedRole ? ` [${verifiedRole}]` : '';
    const extra = who && who !== verifiedId && !verifiedId.includes(who) ? ` (${who})` : '';
    return `${verifiedId}${role}${extra}`;
  }
  if (who) return `${who}${claimedRole ? ` [${claimedRole}, unverified]` : ' [unverified]'}`;
  return 'local-operator';
}

/** Any signed-in user (Member or Admin). Used for HITL approve/reject. */
export async function requireAuthIfConfigured(req: Request, res: Response, next: NextFunction) {
  return requirePermIfConfigured('hitl:approve')(req, res, next);
}

/** org:admin only. Used for skills / RAG / DAG config edits. */
export async function requireAdminIfConfigured(req: Request, res: Response, next: NextFunction) {
  return requirePermIfConfigured('config:edit')(req, res, next);
}
