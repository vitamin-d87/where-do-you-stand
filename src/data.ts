export type Question = {
  id: string;
  group: number;
  theme: string;
  left: string;
  right: string;
};
export const groups = [
  {
    title: "How our minds work",
    subtitle:
      "Exploring how we think, develop ideas, make decisions and approach different perspectives.",
    color: "#7461b8",
    main: "Are we a team that naturally approaches problems and decisions in similar ways, or do we have quite different instincts?",
    prompts: [
      "Which results surprised you most?",
      "Where might our different approaches complement each other?",
      "Are there any differences that could lead to interesting debates?",
    ],
  },
  {
    title: "How we connect with others",
    subtitle:
      "Exploring relationships, communication and how we interact with people around us.",
    color: "#087b73",
    main: "What have we learned about how people like to interact, and is there anything that surprised us?",
    prompts: [
      "Are we mostly on the same wavelength when it comes to communication?",
      "Does anyone have a preference that's completely different from the rest of the team?",
      "What's one thing we could do to make working together easier?",
    ],
  },
  {
    title: "How we make things happen",
    subtitle:
      "Exploring how we approach planning, collaboration and getting things over the finish line.",
    color: "#b75739",
    main: "Do our approaches to planning holidays reflect how we approach work, or are we completely different outside the office?",
    prompts: [
      "Are we predominantly starters or completer-finishers?",
      "Do we have a good mix of people who enjoy getting things going and those who enjoy perfecting them?",
      "Which results surprised you most?",
    ],
  },
];
const endpoints = [
  [
    "Curiosity",
    "I love becoming an expert in one subject",
    "I love knowing a little about lots of things",
  ],
  [
    "Developing ideas",
    "I think best by talking things through",
    "I prefer to think before sharing ideas",
  ],
  [
    "Decision-making",
    "I like to gather as much information as possible before deciding",
    "I'm comfortable making a decision with the information available",
  ],
  [
    "Constructive challenge",
    "I enjoy debating ideas in the moment",
    "I prefer to reflect and offer considered challenge",
  ],
  [
    "Perfect weekend",
    "A packed diary, people to see and places to go",
    "Absolutely no plans, and that's how I like it",
  ],
  [
    "Interacting with colleagues",
    "A good one-to-one conversation",
    "The energy of a lively group discussion",
  ],
  [
    "Communication",
    "Just give me a quick call or Teams chat",
    "Send me a message I can respond to later",
  ],
  [
    "Receiving feedback",
    "Tell me straight away, even if I haven't asked",
    "I prefer considered feedback at an agreed time",
  ],
  [
    "Holiday planning",
    "Every day planned, itinerary ready",
    "Book the flights and work it out when I arrive",
  ],
  [
    "Planning at work",
    "Give me a plan and clear milestones",
    "Let's get started and adapt as we go",
  ],
  [
    "Collaboration",
    "Let's start with a blank page together",
    "Let's start with a draft and discuss it",
  ],
  [
    "Starting vs finishing",
    "I get the most satisfaction from getting something started and moving",
    "I love the final 10% — checking, refining and making everything just right",
  ],
];
export const questions: Question[] = endpoints.map(
  ([theme, left, right], i) => ({
    id: `q${i + 1}`,
    group: Math.floor(i / 4),
    theme,
    left,
    right,
  }),
);
export type Participant = {
  id: string;
  name: string;
  answers: Record<string, number>;
  photo?: string;
  created_at: string;
};
export type EventInfo = {
  id: string;
  title: string;
  open: boolean;
  expected: number;
  retention_days: number;
  created_at: string;
};
export const colors = [
  "#7461b8",
  "#087b73",
  "#ba593f",
  "#4564a6",
  "#a64579",
  "#728031",
  "#9e6825",
  "#52666f",
];
export function shuffle<T>(
  items: T[],
  random = () => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296,
): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
export const toSlot = (value: number) => Math.round(value / 4);
export function validAnswers(a: Record<string, number>) {
  return (
    Object.keys(a).length === 12 &&
    questions.every(
      (q) => Number.isInteger(a[q.id]) && a[q.id] >= 0 && a[q.id] <= 24,
    )
  );
}
export function demoParticipants(): Participant[] {
  return [
    "Alex",
    "Priya",
    "Sam",
    "Morgan",
    "Noor",
    "Jamie",
    "Robin",
    "Taylor",
  ].map((name, i) => ({
    id: `demo-${i}`,
    name,
    created_at: new Date().toISOString(),
    answers: Object.fromEntries(
      questions.map((q, j) => [
        q.id,
        j === 0 ? 12 : (i * 7 + j * 5 + ((i * j) % 11)) % 25,
      ]),
    ),
  }));
}
// Fixed slots preserve position. One column per slot, one row per participant: no overlap even for eight identical answers.
export function stackAtSlots(people: Participant[], qid: string) {
  const used = new Map<number, number>();
  return people
    .filter((p) => Number.isInteger(p.answers[qid]))
    .map((p) => {
      const slot = toSlot(p.answers[qid]);
      const row = used.get(slot) || 0;
      used.set(slot, row + 1);
      return { p, slot, row };
    });
}
export function insight(people: Participant[], group: number) {
  const stats = questions
    .filter((q) => q.group === group)
    .map((q) => {
      const a = people.map((p) => p.answers[q.id]).filter(Number.isInteger);
      const mean = a.reduce((s, v) => s + v, 0) / (a.length || 1);
      return {
        theme: q.theme,
        spread: a.length ? Math.max(...a) - Math.min(...a) : 0,
        variance: a.reduce((s, v) => s + (v - mean) ** 2, 0) / (a.length || 1),
      };
    });
  return {
    aligned: [...stats].sort((a, b) => a.variance - b.variance)[0].theme,
    spread: [...stats].sort((a, b) => b.spread - a.spread)[0].theme,
  };
}
export const csv = (people: Participant[]) =>
  "\ufeff" +
  [
    ["Name", "Submitted at", ...questions.map((q) => q.theme)],
    ...people.map((p) => [
      p.name,
      p.created_at,
      ...questions.map((q) => p.answers[q.id] ?? ""),
    ]),
  ]
    .map((row) =>
      row
        .map(
          (v) =>
            '"' +
            String(v)
              .replace(/^[=+\-@\t\r]/, "'$&")
              .replaceAll('"', '""') +
            '"',
        )
        .join(","),
    )
    .join("\r\n");
