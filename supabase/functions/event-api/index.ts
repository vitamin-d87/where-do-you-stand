import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import jpeg from "npm:jpeg-js@0.4.4";
const env = (key: string) => Deno.env.get(key) || "";
const keys = JSON.parse(env("SUPABASE_SECRET_KEYS") || "{}");
const secret =
  env("APP_SUPABASE_SECRET_KEY") || keys.default || Object.values(keys)[0];
if (!secret) throw Error("A current Supabase secret key is required.");
const db = createClient(env("SUPABASE_URL"), String(secret), {
  auth: { persistSession: false, autoRefreshToken: false },
});
// Exact additional origin for the neutral Team Teeth deployment. Existing
// ALLOWED_ORIGINS values remain supported during the hosting transition.
const origins = [
  "https://team-teeth-stand.greentitan15.chatgpt.site",
  ...env("ALLOWED_ORIGINS").split(",").map((s) => s.trim()),
].filter(Boolean);
const hash = async (s: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)),
    ),
  )
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
const token = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
class HttpError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
const check = (error: unknown) => {
  if (error)
    throw new HttpError(
      "The database operation failed. Retry, or contact your organiser.",
      503,
    );
};
async function limit(key: string, max: number, seconds = 600) {
  const { data, error } = await db.rpc("consume_limit", {
    k: key,
    max_hits: max,
    seconds,
  });
  check(error);
  if (!data)
    throw new HttpError(
      "Too many attempts. Please wait ten minutes and try again.",
      429,
    );
}
async function erase(eventId: string, id?: string) {
  // Closing the event takes the same event lock as save_response, so in-flight
  // submissions finish before the photo list is read, and no later writes pass.
  const { data: before, error: readError } = await db
    .from("events")
    .select("open")
    .eq("id", eventId)
    .single();
  check(readError);
  check(
    (await db.from("events").update({ open: false }).eq("id", eventId)).error,
  );
  let query = db
    .from("responses")
    .select("id,photo_path")
    .eq("event_id", eventId);
  if (id) query = query.eq("id", id);
  const { data, error } = await query;
  check(error);
  const paths = (data || []).map((r) => r.photo_path).filter(Boolean);
  if (paths.length)
    check((await db.storage.from("portraits").remove(paths)).error);
  // Delete orphaned photos left by interrupted uploads as well during full purge.
  if (!id) {
    while (true) {
      const { data: files, error: le } = await db.storage
        .from("portraits")
        .list(eventId, { limit: 100 });
      check(le);
      if (!files?.length) break;
      check(
        (
          await db.storage
            .from("portraits")
            .remove(files.map((f) => `${eventId}/${f.name}`))
        ).error,
      );
    }
  }
  let del = db.from("responses").delete().eq("event_id", eventId);
  if (id) del = del.eq("id", id);
  check((await del).error);
  if (id && before?.open)
    check(
      (await db.from("events").update({ open: true }).eq("id", eventId)).error,
    );
}
async function cappedJSON(req: Request) {
  const reader = req.body?.getReader();
  if (!reader) throw new HttpError("Empty request");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 600000) {
      await reader.cancel();
      throw new HttpError("Request too large", 413);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let pos = 0;
  for (const c of chunks) {
    bytes.set(c, pos);
    pos += c.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new HttpError("Invalid JSON");
  }
}
Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") || "";
  const cors = {
    "Access-Control-Allow-Origin": origins.includes(origin) ? origin : "null",
    "Access-Control-Allow-Headers":
      "authorization,apikey,content-type,x-cleanup-secret",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    Vary: "Origin",
    "Cache-Control": "no-store",
    "Content-Type": "application/json",
    "X-Content-Type-Options": "nosniff",
  };
  const reply = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: cors });
  if (origin && !origins.includes(origin))
    return reply({ error: "Origin not allowed" }, 403);
  if (req.method === "OPTIONS")
    return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return reply({ error: "Use POST" }, 405);
  try {
    // Hash IPs before storing short-lived counters. Supabase's proxy supplies this
    // header. The independent event-wide limiter also bounds distributed attempts.
    const ip = (req.headers.get("x-forwarded-for") || "unknown")
      .split(",")[0]
      .trim();
    await limit("request:" + (await hash(ip)), 180);
    const body = await cappedJSON(req);
    const action = body.action;
    if (action === "cleanup") {
      const expected = env("CLEANUP_SECRET");
      const provided = req.headers.get("x-cleanup-secret") || "";
      if (
        expected.length < 32 ||
        (await hash(provided)) !== (await hash(expected))
      )
        throw new HttpError("Not authorised", 403);
      const { data, error } = await db
        .from("events")
        .select("id,created_at,retention_days");
      check(error);
      let deleted = 0;
      for (const e of data || [])
        if (
          Date.now() >=
          Date.parse(e.created_at) + e.retention_days * 86400000
        ) {
          await erase(e.id);
          deleted++;
        }
      return reply({ deleted });
    }
    if (action === "status" || action === "submit") {
      if (
        typeof body.eventId !== "string" ||
        !/^[0-9a-f-]{36}$/.test(body.eventId) ||
        typeof body.invite !== "string" ||
        !/^[a-f0-9]{64}$/.test(body.invite)
      )
        throw new HttpError(
          "This invitation is not valid. Ask your organiser for the current link.",
          403,
        );
      const inviteHash = await hash(body.invite);
      const { data: event, error } = await db
        .from("events")
        .select("*")
        .eq("id", body.eventId)
        .eq("invite_hash", inviteHash)
        .maybeSingle();
      check(error);
      if (!event)
        throw new HttpError(
          "This invitation is not valid. Ask your organiser for the current link.",
          403,
        );
      const expired =
        Date.now() >=
        Date.parse(event.created_at) + event.retention_days * 86400000;
      if (action === "status")
        return reply({
          event: {
            id: event.id,
            title: event.title,
            open: event.open && !expired,
            expected: event.expected,
            retention_days: event.retention_days,
            created_at: event.created_at,
          },
        });
      if (!event.open || expired)
        throw new HttpError(
          "This survey is closed or expired. Please speak to your organiser.",
          409,
        );
      await limit("submits:" + event.id, 30);
      if (
        typeof body.receipt !== "string" ||
        !/^[a-zA-Z0-9-]{64,128}$/.test(body.receipt)
      )
        throw new HttpError("Invalid correction receipt");
      if (
        typeof body.name !== "string" ||
        !body.name.trim() ||
        body.name.trim().length > 32 ||
        /[\x00-\x1f]/.test(body.name)
      )
        throw new HttpError("Enter a display name of 1–32 characters.");
      if (body.consent !== true)
        throw new HttpError(
          "Please confirm that you are happy to share your responses with the team.",
        );
      const answers = body.answers;
      if (
        !answers ||
        typeof answers !== "object" ||
        Array.isArray(answers) ||
        Object.keys(answers).length !== 12 ||
        !Array.from({ length: 12 }, (_, i) => answers[`q${i + 1}`]).every(
          (v) => Number.isInteger(v) && v >= 0 && v <= 24,
        )
      )
        throw new HttpError("All twelve questions need a valid answer.");
      let photoPath: string | null = null;
      if (body.photo !== undefined && body.photo !== null) {
        if (
          typeof body.photo !== "string" ||
          !body.photo.startsWith("data:image/jpeg;base64,") ||
          body.photo.length > 500000
        )
          throw new HttpError("Use a JPEG portrait smaller than 350 KB.");
        let cleaned: Uint8Array;
        try {
          const bytes = Uint8Array.from(atob(body.photo.split(",")[1]), (c) =>
            c.charCodeAt(0),
          );
          const decoded = jpeg.decode(bytes, {
            useTArray: true,
            maxResolutionInMP: 1,
            maxMemoryUsageInMB: 32,
          });
          if (
            decoded.width > 1024 ||
            decoded.height > 1024 ||
            decoded.width < 1 ||
            decoded.height < 1
          )
            throw Error();
          cleaned = jpeg.encode(decoded, 80).data;
        } catch {
          throw new HttpError(
            "This photograph could not be read. Try a different image, or continue without a photograph.",
          );
        }
        if (cleaned.length > 400000)
          throw new HttpError(
            "This photograph is too large. Choose a smaller image.",
          );
        photoPath = `${event.id}/${crypto.randomUUID()}.jpg`;
        const { error: uploadError } = await db.storage
          .from("portraits")
          .upload(photoPath, cleaned, {
            contentType: "image/jpeg",
            upsert: false,
          });
        if (uploadError)
          throw new HttpError(
            "Your photograph could not be uploaded. Your answers are still on this device. Retry, or remove the photo and submit.",
            503,
          );
      }
      const { data, error: saveError } = await db.rpc("save_response", {
        eid: event.id,
        invitation: inviteHash,
        receipt: await hash(body.receipt),
        display_name: body.name.trim(),
        values_json: answers,
        portrait: photoPath,
      });
      if (saveError) {
        if (photoPath) await db.storage.from("portraits").remove([photoPath]);
        if (saveError.code === "23505")
          throw new HttpError(
            "That display name already has a response. Add your initial, or ask the organiser to remove the old entry.",
            409,
          );
        throw new HttpError(
          "Could not save. The survey may have closed or the invitation changed. Your answers are safe; check with the organiser and retry.",
          409,
        );
      }
      if (data.old_photo && data.old_photo !== photoPath)
        await db.storage.from("portraits").remove([data.old_photo]);
      return reply({ ok: true });
    }
    // Every other action requires a verified Auth JWT AND a database allowlist entry.
    const bearer = req.headers.get("authorization")?.replace(/^Bearer /i, "");
    if (!bearer) throw new HttpError("Organiser sign-in required", 401);
    const { data: auth, error: authError } = await db.auth.getUser(bearer);
    if (authError || !auth.user)
      throw new HttpError("Your session has expired. Sign in again.", 401);
    const { data: admin, error: adminError } = await db
      .from("administrators")
      .select("user_id")
      .eq("user_id", auth.user.id)
      .maybeSingle();
    check(adminError);
    if (!admin)
      throw new HttpError("This account is not an authorised organiser.", 403);
    const { data: event, error: eventError } = await db
      .from("events")
      .select("*")
      .eq("owner", auth.user.id)
      .maybeSingle();
    check(eventError);
    if (action === "create") {
      if (event)
        throw new HttpError(
          "You already have a session. Refresh the dashboard.",
          409,
        );
      const invite = token();
      const { data, error } = await db
        .from("events")
        .insert({ owner: auth.user.id, invite_hash: await hash(invite) })
        .select("id")
        .single();
      check(error);
      return reply({ eventId: data!.id, invite });
    }
    if (!event) {
      if (action === "list") return reply({ event: null, people: [] });
      throw new HttpError("Create a session first.");
    }
    const publicEvent = {
      id: event.id,
      title: event.title,
      open: event.open,
      expected: event.expected,
      retention_days: event.retention_days,
      created_at: event.created_at,
    };
    if (action === "list") {
      if (
        Date.now() >=
        Date.parse(event.created_at) + event.retention_days * 86400000
      ) {
        await erase(event.id);
        return reply({ event: { ...publicEvent, open: false }, people: [] });
      }
      const { data: rows, error } = await db
        .from("responses")
        .select("id,name,answers,photo_path,created_at")
        .eq("event_id", event.id)
        .order("created_at");
      check(error);
      const people = await Promise.all(
        (rows || []).map(async ({ photo_path, ...p }) => {
          if (!photo_path) return p;
          const { data, error } = await db.storage
            .from("portraits")
            .createSignedUrl(photo_path, 120);
          check(error);
          return { ...p, photo: data?.signedUrl };
        }),
      );
      return reply({ event: publicEvent, people });
    }
    if (action === "settings") {
      const updates: Record<string, unknown> = {};
      if (typeof body.open === "boolean") updates.open = body.open;
      for (const [name, min, max] of [
        ["expected", 1, 64],
        ["retention_days", 1, 90],
      ] as const) {
        if (body[name] !== undefined) {
          if (
            !Number.isInteger(body[name]) ||
            body[name] < min ||
            body[name] > max
          )
            throw new HttpError(`Invalid ${name}`);
          updates[name] = body[name];
        }
      }
      if (
        updates.retention_days &&
        Date.now() >=
          Date.parse(event.created_at) +
            Number(updates.retention_days) * 86400000
      )
        throw new HttpError(
          "Choose a future retention deadline, or explicitly delete all responses.",
        );
      if (
        updates.open &&
        Date.now() >=
          Date.parse(event.created_at) +
            Number(updates.retention_days || event.retention_days) * 86400000
      )
        throw new HttpError(
          "This session has expired. Extend retention before reopening, or create a fresh session after setup.",
        );
      check((await db.from("events").update(updates).eq("id", event.id)).error);
      return reply({ ok: true });
    }
    if (action === "rotate") {
      const invite = token();
      check(
        (
          await db
            .from("events")
            .update({ invite_hash: await hash(invite) })
            .eq("id", event.id)
        ).error,
      );
      return reply({ eventId: event.id, invite });
    }
    if (action === "remove") {
      if (typeof body.id !== "string" || !/^[0-9a-f-]{36}$/.test(body.id))
        throw new HttpError("Invalid response");
      await erase(event.id, body.id);
      return reply({ ok: true });
    }
    if (action === "purge") {
      await erase(event.id);
      return reply({ ok: true });
    }
    throw new HttpError("Unknown action");
  } catch (e) {
    return reply(
      {
        error:
          e instanceof HttpError
            ? e.message
            : "The server could not complete this request. Your answers are saved on this device; please retry.",
      },
      e instanceof HttpError ? e.status : 500,
    );
  }
});
