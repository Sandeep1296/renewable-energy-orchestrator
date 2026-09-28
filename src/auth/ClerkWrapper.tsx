import React, { useEffect, useState } from 'react';

const clerkKey = ((import.meta as any).env?.VITE_CLERK_PUBLISHABLE_KEY
  ?? (typeof process !== 'undefined' ? (process as any).env?.VITE_CLERK_PUBLISHABLE_KEY : undefined)) as string | undefined;

/**
 * Clerk via bundled clerk-js core only (its lazy UI-component chunks do not
 * survive Vite dev pre-bundling, so embedded/mounted components are avoided).
 * - Login: redirect to Clerk-hosted sign-in (Account Portal), then back here.
 * - Session/role/org: headless reads + setActive — no UI bundle needed.
 * - Backend tokens: session.getToken() carries org_role when an org is active.
 */
let clerkInstance: any = null;
let bootError: string | null = null;
let bootAttempted = false;

function keyProblem(): string | null {
  if (!clerkKey) return 'VITE_CLERK_PUBLISHABLE_KEY is not set (Vite restart required after adding it).';
  if (!clerkKey.startsWith('pk_test_') && !clerkKey.startsWith('pk_live_')) {
    return `VITE_CLERK_PUBLISHABLE_KEY looks wrong (starts with "${clerkKey.slice(0, 8)}…", expected pk_test_… or pk_live_…). Use the Publishable Key from Clerk → API Keys.`;
  }
  return null;
}

async function ensureBundledClerk(): Promise<any> {
  if (clerkInstance) return clerkInstance;
  if (!clerkKey) throw new Error('Missing publishable key');
  const { Clerk } = await import('@clerk/clerk-js');
  const clerk = new Clerk(clerkKey);
  await clerk.load();
  clerkInstance = clerk;
  try {
    if (!(window as any).Clerk) (window as any).Clerk = clerk;
  } catch { /* ignore */ }
  return clerk;
}

function useClerkBoot(): { ready: boolean; error: string | null } {
  const [state, setState] = useState({ ready: Boolean(clerkInstance), error: bootError });
  useEffect(() => {
    if (!clerkKey || clerkInstance) return;
    if (bootAttempted && bootError) return;
    bootAttempted = true;
    ensureBundledClerk()
      .then(() => setState({ ready: true, error: null }))
      .catch((e) => {
        bootError = `Clerk init failed: ${String(e?.message || e).slice(0, 220)}`;
        console.error('[clerk]', bootError);
        setState({ ready: false, error: bootError });
      });
  }, []);
  return state;
}

export interface SessionInfo {
  loaded: boolean;
  signedIn: boolean;
  role: 'admin' | 'member' | string | null;
  orgName: string | null;
  orgId: string | null;
  memberships: Array<{ id: string; name: string; role: string }>;
  local: boolean;
}

/** Pure session snapshot from a ClerkJS-like global. Unit-testable login/logout transitions. */
export function readSessionState(c: any): { signedIn: boolean; role: 'admin' | 'member' | string | null; orgName: string | null } {
  const memberships = c?.user?.organizationMemberships || [];
  const activeId = c?.organization?.id || c?.session?.lastActiveOrganizationId;
  const active = memberships.find((m: any) => m.organization?.id === activeId) || memberships[0];
  const raw = active?.role as string | undefined;
  return {
    signedIn: Boolean(c?.session),
    role: raw ? (raw.startsWith('org:') ? raw.slice(4) : raw) : null,
    orgName: active?.organization?.name || c?.organization?.name || null,
  };
}

export function useSession(): SessionInfo {
  const [info, setInfo] = useState<SessionInfo>(() =>
    !clerkKey
      ? { loaded: true, signedIn: true, role: 'admin', orgName: 'local', orgId: null, memberships: [], local: true }
      : { loaded: false, signedIn: false, role: null, orgName: null, orgId: null, memberships: [], local: false },
  );
  useEffect(() => {
    if (!clerkKey) return;
    let alive = true;
    const read = () => {
      try {
        const c = clerkInstance || (window as any).Clerk;
        if (!c || !c.loaded) return;
        const s = readSessionState(c);
        const memberships = (c?.user?.organizationMemberships || []).map((m: any) => ({
          id: m.organization?.id as string,
          name: m.organization?.name as string,
          role: String(m.role || '').replace(/^org:/, ''),
        }));
        const orgId = c?.organization?.id || c?.session?.lastActiveOrganizationId || null;
        if (!alive) return;
        // Skip identical snapshots — prevents a re-render storm every poll tick.
        setInfo((prev) => {
          const same = prev.loaded && prev.signedIn === s.signedIn && prev.role === s.role &&
            prev.orgName === s.orgName && prev.orgId === orgId && prev.memberships.length === memberships.length;
          return same ? prev : { loaded: true, signedIn: s.signedIn, role: s.role, orgName: s.orgName, orgId, memberships, local: false };
        });
      } catch { /* keep previous */ }
    };
    read();
    const t = setInterval(read, 2000);
    let unsub: (() => void) | null = null;
    try {
      if (clerkInstance?.addListener) unsub = clerkInstance.addListener(read);
    } catch { /* ignore */ }
    return () => { alive = false; clearInterval(t); try { unsub && unsub(); } catch { /* ignore */ } };
  }, []);
  return info;
}

const APPROVE_ROLES = new Set(['admin', 'operator', 'member']);
const OPERATE_ROLES = new Set(['admin', 'operator', 'member']);

export interface Permissions {
  role: string | null;
  local: boolean;
  isAdmin: boolean;    // config edits: skills, RAG, DAG
  canOperate: boolean; // run dispatch, inject events, tune weights/thresholds/portfolio
  canApprove: boolean; // HITL approve
  isViewer: boolean;   // read-only dashboards
}

/** Pure role → permission mapping. Unit-testable; single source of truth. */
export function permissionsForRole(role: string | null, signedIn: boolean, local: boolean): Permissions {
  if (local) return { role: 'admin', local: true, isAdmin: true, canOperate: true, canApprove: true, isViewer: false };
  const isAdmin = signedIn && role === 'admin';
  const canOperate = signedIn && role !== null && OPERATE_ROLES.has(role);
  const canApprove = signedIn && role !== null && APPROVE_ROLES.has(role);
  return { role, local: false, isAdmin, canOperate, canApprove, isViewer: signedIn && !canOperate };
}

/** Single source of truth for role-wise UI gating. */
export function usePermissions(): Permissions {
  const s = useSession();
  return permissionsForRole(s.role, s.signedIn, s.local);
}

export function useIsAdmin(): boolean {
  return usePermissions().isAdmin;
}

export function useCanApprove(): boolean {
  return usePermissions().canApprove;
}

export function AuthWrapper({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export async function signInRedirect(): Promise<string | null> {
  try {
    const clerk = clerkInstance || (window as any).Clerk || (await ensureBundledClerk());
    await clerk.redirectToSignIn({ signInFallbackRedirectUrl: window.location.href });
    return null;
  } catch (e) {
    const msg = `Could not open Clerk-hosted sign-in: ${String((e as any)?.message || e).slice(0, 200)}. Enable it in Dashboard → Account Portal → Sign-in.`;
    console.error('[clerk]', msg);
    return msg;
  }
}

export async function signOutToLogin(): Promise<void> {
  try {
    const clerk = clerkInstance || (window as any).Clerk;
    if (clerk?.signOut) await clerk.signOut();
  } catch (e) {
    console.error('[clerk] signOut failed:', e);
  } finally {
    window.location.href = '/';
  }
}

export async function switchOrganization(orgId: string): Promise<string | null> {
  try {
    const clerk = clerkInstance || (window as any).Clerk;
    if (!clerk?.setActive) return 'Org switching unavailable (Clerk not ready).';
    await clerk.setActive({ organization: orgId });
    return null;
  } catch (e) {
    const msg = `Org switch failed: ${String((e as any)?.message || e).slice(0, 160)}`;
    console.error('[clerk]', msg);
    return msg;
  }
}

function LoaderHelp({ detail }: { detail?: string }) {
  const problem = keyProblem();
  return (
    <div className="max-w-md text-left bg-panel border border-line rounded-xl p-4 space-y-2 text-xs">
      <div className="font-semibold text-am font-mono">Sign-in is not initializing</div>
      {problem && <div className="text-ro">{problem}</div>}
      {detail && <div className="text-muted font-mono break-words">{detail}</div>}
      <button onClick={() => window.location.reload()} className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-onaccent rounded-lg font-medium">
        Retry sign-in
      </button>
    </div>
  );
}

/** Default-URL login gate: when Clerk is configured, "/" shows the email
 *  login screen until the operator signs in. Local mode passes straight through. */
export function LoginGate({ children }: { children: React.ReactNode }) {
  const { ready, error } = useClerkBoot();
  const session = useSession();
  const [signInError, setSignInError] = useState<string | null>(null);
  if (!clerkKey) return <>{children}</>;
  const problem = keyProblem();
  if (problem || error) {
    return (
      <div className="min-h-screen bg-page text-paper flex flex-col items-center justify-center gap-4 p-6">
        <div className="text-base font-semibold">Renewable Energy Orchestrator</div>
        <LoaderHelp detail={error || undefined} />
      </div>
    );
  }
  if (!ready || !session.loaded) {
    return (
      <div className="min-h-screen bg-page text-muted flex flex-col items-center justify-center gap-4 p-6 font-mono text-sm">
        <div>Loading operator sign-in…</div>
      </div>
    );
  }
  if (!session.signedIn) {
    return (
      <div className="min-h-screen bg-page text-paper flex flex-col items-center justify-center gap-6 p-6">
        <div className="text-center space-y-1">
          <div className="text-lg font-semibold tracking-tight">Renewable Energy Orchestrator</div>
          <p className="text-xs text-muted font-mono">15-minute dispatch console · sign in with email to continue</p>
        </div>
        <button
          onClick={async () => setSignInError(await signInRedirect())}
          className="px-5 py-2.5 text-sm font-semibold text-onaccent bg-cyan-600 rounded-lg hover:bg-cyan-500 shadow"
        >
          Sign in with email
        </button>
        {signInError && <div className="max-w-md text-xs text-am bg-panel border border-amber-500/40 rounded-xl p-3">{signInError}</div>}
        <p className="text-[11px] text-faint font-mono">SSO not required · email verification code · role assigned by your org admin</p>
      </div>
    );
  }
  return <>{children}</>;
}

export function AuthSlot() {
  const session = useSession();
  const [switchError, setSwitchError] = useState<string | null>(null);
  if (!clerkKey) {
    return (
      <span className="px-2 py-1 rounded bg-panel border border-line text-[11px] font-mono text-muted" title="Set VITE_CLERK_PUBLISHABLE_KEY + CLERK_SECRET_KEY to enforce operator login">
        local-operator · admin
      </span>
    );
  }
  if (!session.signedIn) {
    return (
      <button
        onClick={async () => { const err = await signInRedirect(); if (err) alert(err); }}
        className="px-2.5 py-1 text-xs font-medium text-onaccent bg-cyan-600 rounded hover:bg-cyan-500"
      >
        Sign in with email
      </button>
    );
  }
  return (
    <span className="flex items-center gap-2">
      {session.memberships.length > 0 && (
        <label className="flex items-center gap-1.5" title="Active organization — its org_role claim authorizes every backend call (config edits need org:admin)">
          <span className="text-[9px] font-mono text-faint hidden sm:inline">ORG</span>
          <select
            value={session.orgId || ''}
            onChange={async (e) => { if (e.target.value) setSwitchError(await switchOrganization(e.target.value)); }}
            className="bg-panel border border-linestrong rounded px-1.5 py-1 text-[11px] text-paper max-w-[150px]"
          >
            {session.memberships.map((m) => (
              <option key={m.id} value={m.id}>{m.name} · {m.role}</option>
            ))}
          </select>
        </label>
      )}
      <span
        className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${session.role === 'admin' ? 'bg-purple-500/15 text-pu border border-purple-500/30' : 'bg-raise text-soft border border-linestrong'}`}
        title={session.orgName ? `Org: ${session.orgName}` : 'Select an organization to activate your role'}
      >
        {session.role ? `${session.role}` : 'no org role'}
      </span>
      <button onClick={() => signOutToLogin()} className="px-2 py-1 text-[11px] text-soft bg-raise rounded hover:bg-strong" title="Sign out and return to login">
        Sign out
      </button>
      {switchError && <span className="text-[10px] text-am font-mono">{switchError}</span>}
    </span>
  );
}

/** Attach Clerk session token (carries org_role when an org is active) to backend calls. */
export async function authHeaders(): Promise<Record<string, string>> {
  try {
    const c = clerkInstance || (window as any).Clerk;
    if (c?.session) {
      const token = await c.session.getToken();
      if (token) return { Authorization: `Bearer ${token}` };
    }
  } catch { /* anonymous */ }
  return {};
}
