import { createClient } from "@supabase/supabase-js";
import { demoParticipants, type Participant, type EventInfo } from "./data";
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (Boolean(url) !== Boolean(key))
  throw new Error(
    "Set both Supabase environment variables, or leave both blank for demo mode.",
  );
export const supabase =
  url && key ? createClient(url, key, { auth: { flowType: "pkce" } }) : null;
export const demo =
  !supabase || new URLSearchParams(location.search).get("demo") === "1";
const initialEvent: EventInfo = {
  id: "demo",
  title: "Our team session",
  open: true,
  expected: 8,
  retention_days: 30,
  created_at: new Date().toISOString(),
};
function read<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) || "null") ?? fallback;
  } catch {
    return fallback;
  }
}
export const demoDB = () =>
  read("wdys-demo", { event: initialEvent, people: demoParticipants() });
export function resetDemo() {
  localStorage.removeItem("wdys-demo");
}
export async function api(
  action: string,
  payload: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  if (demo) {
    await new Promise((r) => setTimeout(r, 180));
    if (localStorage.getItem("wdys-fail") === "network")
      throw Error(
        "Simulated network failure. Turn it off in Demo testing, then retry.",
      );
    if (payload.photo && localStorage.getItem("wdys-fail") === "photo")
      throw Error(
        "Simulated photo upload failure. Your answers are safe. Remove the photo or turn off the failure and retry.",
      );
    const db = demoDB();
    let result: Record<string, unknown> = {};
    if (action === "status") return { event: db.event };
    if (action === "list") return db;
    if (action === "submit") {
      if (!db.event.open)
        throw Error("This survey is closed. Please speak to the organiser.");
      const existing = db.people.find((p) => p.id === payload.receipt);
      if (
        db.people.some(
          (p) =>
            p.name.toLowerCase() === String(payload.name).toLowerCase() &&
            p.id !== existing?.id,
        )
      )
        throw Error(
          "That display name is already in use. Add an initial, or ask the organiser to remove the old entry.",
        );
      const p = {
        id: String(payload.receipt),
        name: String(payload.name),
        answers: payload.answers as Participant["answers"],
        photo: payload.photo as string | undefined,
        created_at: new Date().toISOString(),
      };
      db.people = db.people.filter((x) => x.id !== p.id).concat(p);
      result = { ok: true };
    } else if (action === "settings") db.event = { ...db.event, ...payload };
    else if (action === "remove")
      db.people = db.people.filter((p) => p.id !== payload.id);
    else if (action === "purge") {
      db.people = [];
      db.event.open = false;
    }
    localStorage.setItem("wdys-demo", JSON.stringify(db));
    return result;
  }
  const session = (await supabase!.auth.getSession()).data.session;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(`${url}/functions/v1/event-api`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: key,
        ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify({ action, ...payload }),
      signal: controller.signal,
    });
    const data = await response.json();
    if (!response.ok)
      throw Error(data.error || "Request failed. Please retry.");
    return data;
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError")
      throw Error(
        "The request timed out. Your answers are saved on this device; retry safely.",
      );
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}
export function download(name: string, data: string, type: string) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([data], { type }));
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
export async function preparePhoto(file: File, zoom = 1): Promise<string> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw Error(
      "Choose a JPEG, PNG or WebP image. On iPhone, use Take Photo or export a JPEG.",
    );
  if (file.size > 12 * 1024 * 1024)
    throw Error("Please choose a photo smaller than 12 MB.");
  const src = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = src;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = c.height = 320;
    const side = Math.min(img.width, img.height) / zoom;
    c.getContext("2d")!.drawImage(
      img,
      (img.width - side) / 2,
      (img.height - side) / 2,
      side,
      side,
      0,
      0,
      320,
      320,
    );
    return c.toDataURL("image/jpeg", 0.82);
  } finally {
    URL.revokeObjectURL(src);
  }
}
