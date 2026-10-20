// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vitest";
const db = new PGlite();
const owner = "11111111-1111-4111-8111-111111111111";
const event = "22222222-2222-4222-8222-222222222222";
const answers = Object.fromEntries(
  Array.from({ length: 12 }, (_, i) => [`q${i + 1}`, 12]),
);
async function save(
  a: Record<string, unknown> = answers,
  receipt = "receipt-one",
  name = "Alex",
  invitation = "invite",
) {
  return db.query<{ save_response: { id: string } }>(
    "select public.save_response($1::uuid,$2::text,$3::text,$4::text,$5::jsonb,null::text)",
    [event, invitation, receipt, name, JSON.stringify(a)],
  );
}
beforeAll(async () => {
  await db.exec(
    `create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key); create schema storage; create table storage.objects(id uuid,bucket_id text); alter table storage.objects enable row level security; grant usage on schema storage to anon,authenticated; grant select,insert,update,delete on storage.objects to anon,authenticated; create policy existing_broad_policy on storage.objects for all to anon,authenticated using(true) with check(true); create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`,
  );
  const sql = readFileSync(
    "supabase/migrations/202610200001_initial.sql",
    "utf8",
  ).replace(
    "create extension if not exists pgcrypto with schema extensions;",
    "",
  );
  await db.exec(sql);
  await db.query("insert into auth.users values ($1)", [owner]);
  await db.query("insert into public.administrators values ($1)", [owner]);
});
beforeEach(async () => {
  await db.exec(
    "reset role; delete from public.events; delete from public.rate_limits;",
  );
  await db.query(
    "insert into public.events(id,owner,invite_hash) values ($1,$2,$3)",
    [event, owner, "invite"],
  );
});
afterAll(() => db.close());
describe("Real PostgreSQL migration and submission boundary", () => {
  it("records one response and replaces it atomically on correction/retry", async () => {
    const a = await save();
    const b = await save({ ...answers, q1: 24 });
    expect(a.rows[0].save_response.id).toBe(b.rows[0].save_response.id);
    expect((await db.query("select * from responses")).rows).toHaveLength(1);
  });
  it("rejects duplicate names without the correction receipt", async () => {
    await save();
    await expect(save(answers, "different", "aLeX")).rejects.toThrow(
      /duplicate key/,
    );
  });
  it("validates missing, extra, fractional and out-of-range responses in the database", async () => {
    const missing = { ...answers };
    delete missing.q3;
    await expect(save(missing)).rejects.toThrow(/Twelve answers/);
    await expect(save({ ...answers, q13: 2 })).rejects.toThrow(
      /Twelve answers/,
    );
    await expect(save({ ...answers, q1: 1.5 })).rejects.toThrow(
      /Invalid answer/,
    );
    await expect(save({ ...answers, q1: 25 })).rejects.toThrow(
      /Invalid answer/,
    );
  });
  it("checks invitation, open state and retention at transaction time", async () => {
    await expect(save(answers, "r", "Alex", "wrong")).rejects.toThrow(
      /Invalid invitation/,
    );
    await db.exec("update events set open=false");
    await expect(save()).rejects.toThrow(/closed/);
    await db.exec(
      "update events set open=true, created_at=now()-interval '31 days'",
    );
    await expect(save()).rejects.toThrow(/expired/);
  });
  it("enforces rate limits centrally and separately per key", async () => {
    for (let i = 0; i < 3; i++) {
      expect(
        (
          await db.query<{ consume_limit: boolean }>(
            "select consume_limit('ip1',2,600)",
          )
        ).rows[0].consume_limit,
      ).toBe(i < 2);
    }
    expect(
      (
        await db.query<{ consume_limit: boolean }>(
          "select consume_limit('ip2',2,600)",
        )
      ).rows[0].consume_limit,
    ).toBe(true);
  });
  it("denies anonymous and non-admin authenticated reads/writes and elevated functions", async () => {
    await save();
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      for (const table of [
        "responses",
        "events",
        "administrators",
        "rate_limits",
        "questions",
      ])
        await expect(db.query(`select * from public.${table}`)).rejects.toThrow(
          /permission denied/,
        );
      await expect(
        db.query("select consume_limit('bypass',1,1)"),
      ).rejects.toThrow(/permission denied/);
      await expect(save()).rejects.toThrow(/permission denied/);
      await expect(
        db.query(
          "insert into public.responses(event_id,receipt_hash,name,answers) values($1,'x','Intruder',$2)",
          [event, JSON.stringify(answers)],
        ),
      ).rejects.toThrow(/permission denied/);
      await db.exec("reset role");
    }
  });
  it("denies browser storage reads even when an existing broad policy would permit them", async () => {
    await db.exec(
      "insert into storage.objects values(gen_random_uuid(),'portraits'); set role anon;",
    );
    expect((await db.query("select * from storage.objects")).rows).toHaveLength(
      0,
    );
    await expect(
      db.exec(
        "insert into storage.objects values(gen_random_uuid(),'portraits')",
      ),
    ).rejects.toThrow(/row-level security/);
    await db.exec("reset role");
  });
  it("keeps every endpoint in the SQL question catalogue identical to the UI", async () => {
    const { questions } = await import("../src/data");
    const rows = (
      await db.query<{
        id: string;
        left_endpoint: string;
        right_endpoint: string;
      }>("select * from questions order by ordinal")
    ).rows;
    expect(rows.map((r) => [r.id, r.left_endpoint, r.right_endpoint])).toEqual(
      questions.map((q) => [q.id, q.left, q.right]),
    );
  });
});
