import { describe, it, expect } from "vitest";
import {
  questions,
  shuffle,
  toSlot,
  validAnswers,
  demoParticipants,
  stackAtSlots,
  csv,
  insight,
} from "../src/data";
describe("Survey data and presentation", () => {
  it("keeps 12 stable questions, ordered in three groups of four", () => {
    expect(questions.map((q) => q.id)).toEqual(
      Array.from({ length: 12 }, (_, i) => `q${i + 1}`),
    );
    expect(
      [0, 1, 2].map((g) => questions.filter((q) => q.group === g).length),
    ).toEqual([4, 4, 4]);
    expect(questions[11].right).toBe(
      "I love the final 10% — checking, refining and making everything just right",
    );
  });
  it("has twelve distinct question prompts and includes them in CSV headings", () => {
    expect(new Set(questions.map((q) => q.prompt)).size).toBe(12);
    expect(questions[0].prompt).toBe(
      "How do you like to build your knowledge?",
    );
    const header = csv([]);
    for (const q of questions) expect(header).toContain(q.prompt);
  });
  it("shuffles a copy, preserving every ID", () => {
    const source = questions.map((q) => q.id);
    const result = shuffle(source, () => 0.2);
    expect(result).not.toEqual(source);
    expect([...result].sort()).toEqual([...source].sort());
    expect(source[0]).toBe("q1");
  });
  it("maps all 25 answers onto seven monotonically ordered positions", () => {
    const slots = Array.from({ length: 25 }, (_, i) => toSlot(i));
    expect([...new Set(slots)]).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(toSlot(12)).toBe(3);
    expect(toSlot(24)).toBe(6);
    expect(slots).toEqual([...slots].sort((a, b) => a - b));
  });
  it("does not accept missing or invalid answers", () => {
    const a = demoParticipants()[0].answers;
    expect(validAnswers(a)).toBe(true);
    expect(validAnswers({ ...a, q1: undefined as unknown as number })).toBe(
      false,
    );
    expect(validAnswers({ ...a, q1: 25 })).toBe(false);
    expect(validAnswers({ ...a, q1: 1.5 })).toBe(false);
  });
  it("preserves positions and avoids duplicate stack cells for eight identical answers", () => {
    const layout = stackAtSlots(demoParticipants(), "q1");
    expect(layout.map((x) => x.slot)).toEqual(Array(8).fill(3));
    expect(new Set(layout.map((x) => `${x.slot}-${x.row}`)).size).toBe(8);
  });
  it("derives insights from actual data and guards against CSV formula execution", () => {
    const people = demoParticipants();
    expect(insight(people, 0).aligned).toBe("Curiosity");
    people[0].name = '=HYPERLINK("evil")';
    expect(csv(people)).toContain('"\'=HYPERLINK(""evil"")"');
  });
});
