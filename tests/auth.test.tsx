import { beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App } from "../src/App";
import { OrganiserPassword } from "../src/OrganiserPassword";

const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  signInWithOtp: vi.fn(),
  verifyOtp: vi.fn(),
  signInWithPassword: vi.fn(),
  updateUser: vi.fn(),
}));
vi.mock("../src/api", async (original) => ({
  ...(await original<typeof import("../src/api")>()),
  demo: false,
  supabase: { auth },
  api: vi.fn().mockResolvedValue({ event: null, people: [] }),
}));
vi.mock("qrcode", () => ({ default: { toDataURL: async () => "" } }));
beforeEach(() => {
  vi.clearAllMocks();
  location.hash = "/admin";
  auth.getSession.mockResolvedValue({ data: { session: null } });
  auth.onAuthStateChange.mockReturnValue({
    data: { subscription: { unsubscribe: vi.fn() } },
  });
});
it("clears a stale code-sent notice when email delivery becomes rate limited", async () => {
  auth.signInWithOtp
    .mockResolvedValueOnce({ error: null })
    .mockResolvedValueOnce({ error: new Error("email rate limit exceeded") });
  render(<App />);
  fireEvent.change(screen.getByLabelText("Email address"), {
    target: { value: "qa@example.test" },
  });
  fireEvent.click(screen.getByRole("button", { name: /Email me a code/ }));
  await screen.findByLabelText("Email code");
  expect(screen.getByRole("status")).toHaveTextContent("Check your email");
  fireEvent.click(screen.getByRole("button", { name: /Use another email/ }));
  expect(screen.getByRole("status")).toBeEmptyDOMElement();
  fireEvent.click(screen.getByRole("button", { name: /Email me a code/ }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "No new code was sent",
  );
  expect(screen.getByRole("status")).toBeEmptyDOMElement();
});
it("signs in using a survey password without requesting an email", async () => {
  auth.signInWithPassword.mockResolvedValue({ error: null });
  render(<App />);
  fireEvent.click(
    screen.getByRole("button", { name: /Use a survey password instead/ }),
  );
  fireEvent.change(screen.getByLabelText("Email address"), {
    target: { value: "QA@example.test" },
  });
  fireEvent.change(screen.getByLabelText("Survey password"), {
    target: { value: "fictional-test-password" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  await screen.findByRole("heading", { name: "Your team, at a glance." });
  expect(auth.signInWithPassword).toHaveBeenCalledWith({
    email: "qa@example.test",
    password: "fictional-test-password",
  });
  expect(auth.signInWithOtp).not.toHaveBeenCalled();
});
it("requires matching passwords and clears password fields after a provider failure", async () => {
  auth.updateUser.mockResolvedValue({
    error: new Error("Recent sign-in required"),
  });
  render(<OrganiserPassword />);
  const password = screen.getByLabelText("New survey password");
  const repeat = screen.getByLabelText("Repeat survey password");
  fireEvent.change(password, { target: { value: "fictional-test-password" } });
  fireEvent.change(repeat, { target: { value: "different-test-password" } });
  fireEvent.submit(
    screen
      .getByRole("button", { name: "Save survey password" })
      .closest("form")!,
  );
  expect(auth.updateUser).not.toHaveBeenCalled();
  fireEvent.change(repeat, { target: { value: "fictional-test-password" } });
  fireEvent.submit(
    screen
      .getByRole("button", { name: "Save survey password" })
      .closest("form")!,
  );
  await waitFor(() => expect(password).toHaveValue(""));
  expect(repeat).toHaveValue("");
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Recent sign-in required",
  );
});
