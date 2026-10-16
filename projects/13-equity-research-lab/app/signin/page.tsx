import { authConfig } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

export default async function SignIn({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const { error, next } = await searchParams;
  const configured = !!authConfig();
  const href = `/api/auth/login${next ? `?next=${encodeURIComponent(next)}` : ""}`;
  return <section className="panel signin">
    <p className="eyebrow">EQUITY RESEARCH LAB</p>
    <h1>Sign in</h1>
    {error && error !== "not-configured" && <p className="warning" role="alert">{error}</p>}
    {configured
      ? <><p>Your research, followed stocks and decisions belong to your Google account, so they follow you to any browser or device.</p><a className="action" href={href}>Continue with Google</a><p className="muted">Only approved accounts can enter.</p></>
      : <><p className="warning" role="alert">Google sign-in is not set up on this deployment yet, so the app is open behind the Vercel login only.</p><p>Follow <code>docs/GOOGLE_SIGNIN_SETUP.md</code> to add <code>GOOGLE_CLIENT_ID</code>, <code>GOOGLE_CLIENT_SECRET</code>, <code>AUTH_SECRET</code> and <code>OWNER_EMAILS</code>.</p></>}
  </section>;
}
