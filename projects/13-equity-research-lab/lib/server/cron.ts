import { createHash, timingSafeEqual } from "node:crypto";

/** Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Fails closed when the secret is unset or short. */
export function cronAuthorized(request: Request, env: Record<string, string | undefined> = process.env): boolean {
  const secret = env.CRON_SECRET?.trim();
  if (!secret || secret.length < 16) return false;
  const header = request.headers.get("authorization") ?? "";
  const given = header.startsWith("Bearer ") ? header.slice(7) : "";
  const d = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(d(given), d(secret));
}
