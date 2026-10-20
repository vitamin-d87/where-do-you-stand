import { beforeEach, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { App } from "../src/App";
import { questions } from "../src/data";
// QR generation uses canvas, which is intentionally absent in this DOM runtime.
vi.mock("qrcode", () => ({
  default: { toDataURL: async () => "data:image/png;base64," },
}));
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  location.hash = "";
});
it("completes an unanswered survey, keeps the shuffle stable, submits and corrects one entry", async () => {
  render(<App />);
  const start = await screen.findByRole("button", { name: /Let’s go/ });
  await waitFor(() => expect(start).toBeEnabled());
  fireEvent.click(start);
  fireEvent.change(screen.getByLabelText("Your display name"), {
    target: { value: "Casey" },
  });
  fireEvent.click(screen.getByLabelText(/happy to share/));
  fireEvent.click(screen.getByRole("button", { name: /On to the questions/ }));
  const first = screen.getByRole("slider").getAttribute("aria-label");
  expect(screen.getByRole("button", { name: /Next question/ })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "A bit of both" }));
  fireEvent.click(screen.getByRole("button", { name: /Next question/ }));
  fireEvent.click(screen.getByRole("button", { name: "Back" }));
  expect(screen.getByRole("slider").getAttribute("aria-label")).toBe(first);
  expect(screen.getByRole("button", { name: /Next question/ })).toBeEnabled();
  for (let i = 0; i < 12; i++) {
    fireEvent.click(screen.getByRole("button", { name: "A bit of both" }));
    fireEvent.click(
      screen.getByRole("button", {
        name: i === 11 ? /Review answers/ : /Next question/,
      }),
    );
  }
  expect(
    screen.getByRole("heading", { name: "Does this feel like you?" }),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Submit my responses/ }));
  await screen.findByRole("heading", { name: /That’s where you stand/ });
  expect(JSON.parse(localStorage.getItem("wdys-demo")!).people).toHaveLength(9);
  fireEvent.click(screen.getByRole("button", { name: /Review or correct/ }));
  fireEvent.click(screen.getByRole("button", { name: /Submit my responses/ }));
  await screen.findByRole("heading", { name: /That’s where you stand/ });
  expect(JSON.parse(localStorage.getItem("wdys-demo")!).people).toHaveLength(9);
});
it("hides actual participant results until a deliberate reveal, independently for each group", async () => {
  location.hash = "/present";
  render(<App />);
  await screen.findByRole("button", { name: /Let’s find out/ });
  fireEvent.click(screen.getByRole("button", { name: /Let’s find out/ }));
  expect(document.querySelectorAll(".plot-person")).toHaveLength(0);
  expect(screen.queryByText("MOST ALIGNED")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Reveal results" }));
  expect(document.querySelectorAll(".plot-person")).toHaveLength(32);
  expect(document.querySelectorAll(".presentation-spectrum")).toHaveLength(4);
  fireEvent.click(screen.getByRole("button", { name: "Next group" }));
  expect(document.querySelectorAll(".plot-person")).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: "Reveal results" }));
  expect(
    screen.getByRole("heading", { name: "How we connect with others." }),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Next group" }));
  expect(document.querySelectorAll(".plot-person")).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: "Reveal results" }));
  expect(document.querySelectorAll(".plot-person")).toHaveLength(32);
  fireEvent.click(screen.getByRole("button", { name: "Hide results" }));
  expect(document.querySelectorAll(".plot-person")).toHaveLength(0);
});
it("preserves a draft on a failed network submission", async () => {
  const answers = Object.fromEntries(questions.map((q) => [q.id, 12]));
  sessionStorage.setItem(
    "wdys-draft-demo-demo",
    JSON.stringify({
      name: "Casey",
      answers,
      order: questions.map((q) => q.id),
      receipt: "test",
      consent: true,
      submitted: false,
    }),
  );
  render(<App />);
  const start = await screen.findByRole("button", { name: /Let’s go/ });
  await waitFor(() => expect(start).toBeEnabled());
  fireEvent.click(start);
  fireEvent.click(screen.getByRole("button", { name: /On to the questions/ }));
  for (let i = 0; i < 12; i++)
    fireEvent.click(
      screen.getByRole("button", {
        name: i === 11 ? /Review answers/ : /Next question/,
      }),
    );
  localStorage.setItem("wdys-fail", "network");
  fireEvent.click(screen.getByRole("button", { name: /Submit my responses/ }));
  await screen.findByRole("alert");
  expect(
    JSON.parse(sessionStorage.getItem("wdys-draft-demo-demo")!).answers,
  ).toEqual(answers);
  expect(
    screen.getByRole("button", { name: /Submit my responses/ }),
  ).toBeEnabled();
});
