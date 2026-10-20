import { test, expect } from "@playwright/test";
import { questions } from "../src/data";
test("phone survey: deliberate answers, review, submit, correct", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?demo=1");
  await expect(
    page.getByRole("img", { name: "Team Teeth", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await page.getByRole("button", { name: "Let’s go!" }).click();
  await page.getByLabel("Your display name").fill("Casey");
  await page.getByLabel(/happy to share/).check();
  await page.getByRole("button", { name: /On to the questions/ }).click();
  await expect(
    page.getByRole("button", { name: "Next question" }),
  ).toBeDisabled();
  const order: string[] = [];
  for (let i = 0; i < 12; i++) {
    const prompt =
      (await page.getByRole("slider").getAttribute("aria-label")) || "";
    order.push(prompt);
    expect(questions.map((q) => q.prompt)).toContain(prompt);
    await expect(
      page.getByRole("heading", { name: prompt, exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "A bit of both", exact: true })
      .click();
    await page
      .getByRole("button", {
        name: i === 11 ? "Review answers" : "Next question",
      })
      .click();
  }
  expect(new Set(order).size).toBe(12);
  await expect(
    page.getByRole("heading", { name: "Does this feel like you?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Submit my responses" }).click();
  await expect(
    page.getByRole("heading", { name: /That’s where you stand/ }),
  ).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > innerWidth,
  );
  expect(overflow).toBe(false);
  await page
    .getByRole("button", { name: "Review or correct my response" })
    .click();
  await page.getByRole("button", { name: "Submit my responses" }).click();
  await expect(
    page.getByRole("heading", { name: /That’s where you stand/ }),
  ).toBeVisible();
  const count = await page.evaluate(
    () => JSON.parse(localStorage.getItem("wdys-demo")!).people.length,
  );
  expect(count).toBe(9);
});
test("1080p: all three groups fit without scrolling or overlapping portraits", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/?demo=1#/present");
  await page.getByRole("button", { name: "Let’s find out" }).click();
  for (let group = 0; group < 3; group++) {
    for (const q of questions.filter((q) => q.group === group))
      await expect(
        page.getByRole("heading", { name: q.prompt, exact: true }),
      ).toBeVisible();
    await expect(page.locator(".plot-person")).toHaveCount(0);
    await page
      .getByRole("button", { name: "Reveal results", exact: true })
      .click();
    await expect(page.locator(".plot-person")).toHaveCount(32);
    await page
      .locator(".plot-person")
      .evaluateAll((elements) =>
        Promise.all(
          elements
            .flatMap((el) => el.getAnimations())
            .map((animation) => animation.finished),
        ),
      );
    const layout = await page.evaluate(() => {
      const container = document.querySelector(".presentation")!;
      const chips = [...document.querySelectorAll(".plot-person")].map((el) =>
        el.getBoundingClientRect(),
      );
      const overlap = chips.some((a, i) =>
        chips
          .slice(i + 1)
          .some(
            (b) =>
              a.left < b.right &&
              a.right > b.left &&
              a.top < b.bottom &&
              a.bottom > b.top,
          ),
      );
      return {
        overflow: container.scrollHeight > container.clientHeight,
        overlap,
        clipped: [...document.querySelectorAll(".plot-person")].some((el) => {
          const a = el.getBoundingClientRect();
          const row = el
            .closest(".presentation-spectrum")!
            .getBoundingClientRect();
          return (
            a.bottom > innerHeight ||
            a.right > innerWidth ||
            a.left < 0 ||
            a.bottom > row.bottom ||
            a.top < row.top
          );
        }),
      };
    });
    await page.screenshot({
      path: `test-results/group-${group + 1}-1080p.png`,
    });
    if (layout.clipped)
      console.log(
        "Clipped portraits",
        await page.locator(".plot-person").evaluateAll((elements) =>
          elements
            .map((el) => {
              const rect = el.getBoundingClientRect();
              const row = el
                .closest(".presentation-spectrum")!
                .getBoundingClientRect();
              return {
                name: el.textContent,
                bottom: rect.bottom,
                rowBottom: row.bottom,
              };
            })
            .filter((item) => item.bottom > item.rowBottom),
        ),
      );

    expect(layout).toEqual({ overflow: false, overlap: false, clipped: false });
    if (group < 2)
      await page.getByRole("button", { name: "Next group" }).click();
  }
});

test("selfie: live camera, capture, retake, save and release camera tracks", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["camera"]);
  await page.addInitScript(() => {
    const media = navigator.mediaDevices;
    const original = media.getUserMedia.bind(media);
    const streams: MediaStream[] = [];
    Object.defineProperty(window, "testCameraStreams", { value: streams });
    media.getUserMedia = async (constraints) => {
      const stream = await original(constraints);
      streams.push(stream);
      return stream;
    };
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?demo=1");
  await page.getByRole("button", { name: "Let’s go!" }).click();
  await page.getByLabel("Your display name").fill("Camera test");
  await page.getByRole("button", { name: "Take photo", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("button", { name: "Capture selfie" }),
  ).toBeEnabled();
  await dialog.getByRole("button", { name: "Capture selfie" }).click();
  await expect(dialog.getByAltText("Your captured selfie")).toBeVisible();
  await dialog.getByRole("button", { name: "Retake", exact: true }).click();
  await expect(
    dialog.getByRole("button", { name: "Capture selfie" }),
  ).toBeEnabled();
  await dialog.getByRole("button", { name: "Capture selfie" }).click();
  await dialog.getByRole("button", { name: "Use this photo" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".photo-row .avatar img")).toBeVisible();
  await expect(page.getByLabel("Photo crop zoom")).toBeVisible();
  expect(
    await page.evaluate(() => {
      const streams = (
        window as unknown as { testCameraStreams: MediaStream[] }
      ).testCameraStreams;
      return (
        streams.length === 2 &&
        streams
          .flatMap((s) => s.getTracks())
          .every((t) => t.readyState === "ended")
      );
    }),
  ).toBe(true);
  await page.getByRole("button", { name: "Take photo", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Capture selfie" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Close camera" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    await page.evaluate(() => {
      const streams = (
        window as unknown as { testCameraStreams: MediaStream[] }
      ).testCameraStreams;
      return (
        streams.length === 3 &&
        streams
          .flatMap((s) => s.getTracks())
          .every((t) => t.readyState === "ended")
      );
    }),
  ).toBe(true);
  await page.screenshot({ path: "test-results/selfie-profile-phone.png" });
});

test("selfie: denied permission gives useful instructions and preserves the profile", async ({
  page,
}) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException("Permission denied", "NotAllowedError");
    };
  });
  await page.goto("/?demo=1");
  await page.getByRole("button", { name: "Let’s go!" }).click();
  await page.getByLabel("Your display name").fill("Keep my name");
  await page.getByRole("button", { name: "Take photo", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Camera permission wasn’t granted",
  );
  await page.getByRole("button", { name: "Back to profile" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByLabel("Your display name")).toHaveValue(
    "Keep my name",
  );
  await expect(page.getByText("Upload", { exact: true })).toBeVisible();
});

test("dashboard: all twelve prompts are shared with the survey and presentation", async ({
  page,
}) => {
  await page.goto("/?demo=1#/admin");
  await page.getByText("Survey questions", { exact: false }).click();
  for (const q of questions)
    await expect(
      page.locator(".question-catalogue").getByText(q.prompt, { exact: true }),
    ).toBeVisible();
});
