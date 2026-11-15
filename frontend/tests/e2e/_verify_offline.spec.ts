// TEMPORARY verification spec (deleted after use): the Body screen offline.
import { expect, test } from "@playwright/test";
import { navTo, registerAndUnlock } from "./helpers";

test("body model loads with the network off", async ({ page, context }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto("/");
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await page.waitForTimeout(8000); // let precaching finish
  await context.setOffline(true);
  await page.reload();
  await registerAndUnlock(page, { name: "Offline Body", crewCode: "VER-OFF", role: "astronaut", pin: "1357" });
  await navTo(page, "Body");
  await expect(page.locator("canvas")).toBeVisible({ timeout: 60000 });
  await expect(page.getByText("Loading body model…")).toHaveCount(0, { timeout: 60000 });
  await page.waitForTimeout(4000);
  // Hover the chest: a real organ tooltip proves the GLB (not the fallback) is in use.
  const box = (await page.locator("canvas").boundingBox())!;
  let tip = "";
  for (let y = 0.3; y <= 0.5 && !tip; y += 0.02) {
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * y);
    await page.waitForTimeout(150);
    if (await page.getByRole("tooltip").count()) tip = (await page.getByRole("tooltip").first().textContent()) ?? "";
  }
  console.log("OFFLINE-TOOLTIP", tip);
  console.log("OFFLINE-ERRORS", JSON.stringify(errors));
  await page.screenshot({ path: process.env.SHOTS + "/offline-body.png" });
  expect(tip).not.toBe("");
});
