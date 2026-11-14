import { expect, test } from "@playwright/test";

test("home page loads the app shell (fresh install -> Crew screen)", async ({
  page,
}) => {
  await page.goto("/");
  // Fresh install: no astronauts, consent not yet acknowledged.
  await expect(
    page.getByRole("heading", { name: "Before you start" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "I understand" }).click();
  await expect(page.getByText("No astronauts registered yet")).toBeVisible();
});
