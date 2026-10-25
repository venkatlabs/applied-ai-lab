import { NextResponse } from "next/server";
import { z } from "zod";
import { sameOrigin } from "@/lib/server/request-security";
import { StoreError, addTrigger, editTrigger, listTriggers, removeTrigger, seedFromReport } from "@/lib/server/triggers-store";

const headers = { "Cache-Control": "private, no-store" };
const symbol = z.string().trim().toUpperCase().regex(/^[A-Z][A-Z.\-]{0,9}$/);
const patchSchema = z.object({ id: z.string().uuid(), text: z.string().trim().min(3).max(300).optional(), threshold: z.number().finite().positive().nullable().optional(), due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(), status: z.enum(["armed", "watch", "tripped"]).optional(), reason: z.string().max(300).optional() });
const deleteSchema = z.object({ id: z.string().uuid(), reason: z.string().max(300).default("") });
const seedSchema = z.object({ action: z.literal("seed"), symbol });

function fail(error: unknown) {
  if (error instanceof StoreError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status, headers });
  if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid request.", code: "invalid" }, { status: 400, headers });
  return NextResponse.json({ error: "Something went wrong.", code: "error" }, { status: 500, headers });
}
const blocked = (request: Request) => sameOrigin(request) ? null : NextResponse.json({ error: "Request origin not allowed" }, { status: 403, headers });

export async function GET(request: Request) {
  try { const s = new URL(request.url).searchParams.get("symbol"); return NextResponse.json({ triggers: await listTriggers(s ? symbol.parse(s) : undefined) }, { headers }); } catch (e) { return fail(e); }
}
export async function POST(request: Request) {
  const no = blocked(request); if (no) return no;
  try {
    const body = await request.json();
    if (body?.action === "seed") return NextResponse.json({ triggers: await seedFromReport(seedSchema.parse(body).symbol) }, { headers });
    return NextResponse.json({ trigger: await addTrigger(body) }, { headers });
  } catch (e) { return fail(e); }
}
export async function PATCH(request: Request) {
  const no = blocked(request); if (no) return no;
  try { const { id, ...patch } = patchSchema.parse(await request.json()); return NextResponse.json({ trigger: await editTrigger(id, patch) }, { headers }); } catch (e) { return fail(e); }
}
export async function DELETE(request: Request) {
  const no = blocked(request); if (no) return no;
  try { const { id, reason } = deleteSchema.parse(await request.json()); await removeTrigger(id, reason); return NextResponse.json({ removed: id }, { headers }); } catch (e) { return fail(e); }
}
