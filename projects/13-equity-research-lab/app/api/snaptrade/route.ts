import { NextRequest, NextResponse } from "next/server";
import { createPersonalReader, readPersonalPortfolio } from "@/lib/server/snaptrade-personal";
import { sameOrigin } from "@/lib/server/request-security";
import { isOwnerRequest } from "@/lib/server/owner-auth";

export const maxDuration = 60;

/** Manual, read-only refresh for the owner's Fidelity and Robinhood connections. Requires owner sign-in. */
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Request origin not allowed." }, { status: 403 });
  // The Origin header is forgeable outside browsers, so an owner session is required as well.
  if (!isOwnerRequest(request)) {
    return NextResponse.json({ error: "Owner sign-in required." }, { status: 401, headers: { "Cache-Control": "private, no-store" } });
  }
  if (process.env.SNAPTRADE_PORTAL_ENABLED !== "true") {
    return NextResponse.json({ error: "Direct account refresh has not been enabled for this portal." }, { status: 503 });
  }

  try {
    const snapshot = await readPersonalPortfolio(createPersonalReader(), new Date(), {
      institutions: ["Fidelity", "Robinhood"],
    });
    return NextResponse.json({
      source: snapshot.source,
      retrievedAt: snapshot.retrievedAt,
      excludedAccountCount: snapshot.excludedAccountCount,
      accounts: snapshot.accounts.map(account => ({
        institution: account.institution,
        name: account.name,
        type: account.raw_type ?? null,
        category: account.account_category ?? null,
        status: account.status ?? null,
        reportedTotal: account.total,
        lastHoldingsSync: account.lastSync,
        positionsAsOf: account.positionsAsOf,
        positionsAvailable: account.positions !== null,
        positions: account.positions?.map(position => ({
          symbol: position.instrument?.symbol ?? null,
          description: position.instrument?.description ?? null,
          kind: position.instrument?.kind ?? null,
          units: numberOrNull(position.units),
          price: numberOrNull(position.price),
          costBasis: numberOrNull(position.cost_basis),
          currency: position.currency ?? null,
          cashEquivalent: position.cash_equivalent === true,
        })) ?? null,
        cash: account.cash,
        warnings: account.warnings,
      })),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not read connected accounts.";
    const status = message.includes("setup is incomplete") ? 503 : 502;
    return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "private, no-store" } });
  }
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}
