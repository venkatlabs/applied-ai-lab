import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const dir = join(__dirname, "..", "supabase", "migrations");
const sql = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(join(dir, f), "utf8"))
  .join("\n");

describe("supabase migrations", () => {
  it("lock every table created in public to client roles", () => {
    const created = [...sql.matchAll(/create table if not exists (?:public\.)?(\w+)/gi)].map((m) => m[1]);
    expect(created.length).toBeGreaterThan(0);
    for (const t of created) {
      const quoted = sql.includes(`'${t}'`) || new RegExp(`public\\.${t} enable row level security`, "i").test(sql);
      expect(quoted, `${t} must have RLS enabled`).toBe(true);
    }
    expect(sql).toMatch(/revoke all on public\.%I from anon, authenticated/);
  });
});
