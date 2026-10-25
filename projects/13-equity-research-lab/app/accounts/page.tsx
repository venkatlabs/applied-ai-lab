import { cookies } from "next/headers";
import { SnapTradeAccounts } from "@/components/SnapTradeAccounts";
import { OwnerSignIn, OwnerSignOut } from "@/components/OwnerSignIn";
import { SESSION_COOKIE, authConfig, readSession } from "@/lib/server/auth";
import { OWNER_COOKIE, ownerKey, verifyOwnerSession } from "@/lib/server/owner-auth";

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  const jar = await cookies(), cfg = authConfig();
  const googleSession = await readSession(cfg, jar.get(SESSION_COOKIE)?.value);
  // With Google sign-in configured, the whole app is already gated; otherwise fall back to the owner key.
  const signedIn = cfg ? !!googleSession : verifyOwnerSession(jar.get(OWNER_COOKIE)?.value);
  return <>
    <section className="hero compact">
      <div><p className="eyebrow">CONNECTED ACCOUNTS</p><h1>See your accounts together.</h1>
        <p className="lede">Refresh read-only Fidelity and Robinhood data when you choose. Other institutions are left out of this view.</p></div>
      {signedIn && !cfg && <div><OwnerSignOut /></div>}
    </section>
    {signedIn ? <SnapTradeAccounts /> : <OwnerSignIn configured={Boolean(ownerKey())} />}
  </>;
}
