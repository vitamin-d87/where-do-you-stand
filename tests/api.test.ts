import { beforeEach, it, expect } from "vitest";
import { api, demoDB } from "../src/api";
import { questions } from "../src/data";
beforeEach(() => localStorage.clear());
const payload = {
  name: "Casey",
  receipt: "fictional-correction-receipt",
  consent: true,
  answers: Object.fromEntries(questions.map((q) => [q.id, 8])),
};
it("simulates duplicate-name rejection, closure and photo failures without losing earlier responses", async () => {
  await api("submit", payload);
  await expect(
    api("submit", { ...payload, receipt: "different" }),
  ).rejects.toThrow(/already in use/);
  expect(demoDB().people).toHaveLength(9);
  await api("settings", { open: false });
  await expect(api("submit", { ...payload, name: "Other" })).rejects.toThrow(
    /closed/,
  );
  await api("settings", { open: true });
  localStorage.setItem("wdys-fail", "photo");
  await expect(
    api("submit", { ...payload, photo: "data:image/jpeg;base64,example" }),
  ).rejects.toThrow(/photo upload failure/);
  expect(demoDB().people).toHaveLength(9);
});
