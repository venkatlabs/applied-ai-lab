import { NextRequest, NextResponse } from "next/server";
import { createPersonalReader, readPersonalPortfolio } from "@/lib/server/snaptrade-personal";
import { sameOrigin } from "@/lib/server/request-security";
import { isOwnerRequest } from "@/lib/server/owner-auth";
import { toConnectedSnapshot } from "@/lib/server/snaptrade-snapshot";
import { authConfig, sessionFromRequest } from "@/lib/server/auth";

export const maxDuration = 60;

/** Manual, read-only refresh for the owner's Fidelity and Robinhood connections. Requires owner sign-in. */
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Request origin not allowed." }, { status: 403 });
  // The Origin header is forgeable outside browsers, so an owner session is required as well.
  const cfg = authConfig();
  if (!(cfg ? await sessionFromRequest(cfg, request) : isOwnerRequest(request))) {
    return NextResponse.json({ error: "Sign-in required." }, { status: 401, headers: { "Cache-Control": "private, no-store" } });
  }
  if (process.env.SNAPTRADE_PORTAL_ENABLED !== "true") {
    return NextResponse.json({ error: "Direct account refresh has not been enabled for this portal." }, { status: 503 });
  }

  try {
    const snapshot = await readPersonalPortfolio(createPersonalReader(), new Date(), {
      institutions: ["Fidelity", "Robinhood"],
    });
    return NextResponse.json(toConnectedSnapshot(snapshot), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not read connected accounts.";
    const status = message.includes("setup is incomplete") ? 503 : 502;
    return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "private, no-store" } });
  }
}

