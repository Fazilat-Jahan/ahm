// TEMPORARY verification spec (deleted after use).
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { navTo, openFromMore, registerAndUnlock } from "./helpers";

async function axe(page: Page, label: string) {
  const r = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .exclude("canvas")
    .analyze();
  const v = r.violations.map((x) => `${x.id} (${x.impact}): ${x.help} — ${x.nodes.slice(0, 4).map((n) => n.target.join(" ")).join(", ")}`);
  console.log(`AXE ${label}:`, JSON.stringify(v));
  return v;
}

test("body: axe with data, keyboard, crew drill-down", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("/");
  await registerAndUnlock(page, { name: "Verify Cmdr", crewCode: "VER-1", role: "commander", pin: "2468" });
  await navTo(page, "Check-in");
  await expect(page.getByText("Step 1 of")).toBeVisible();
  const next = page.getByRole("button", { name: "Next", exact: true });
  await next.click();
  await page.getByRole("button", { name: "None today" }).click();
  await next.click();
  await page.getByRole("textbox", { name: "Resting heart rate", exact: true }).fill("115");
  await next.click();
  await page.getByRole("button", { name: "Good", exact: true }).click();
  await next.click();
  await page.getByRole("button", { name: "Save check-in" }).click();
  await expect(page.getByText(/Rules version/).first()).toBeVisible();
  await navTo(page, "Body");
  await expect(page.getByText("Loading body model…")).toHaveCount(0, { timeout: 60000 });
  await page.waitForTimeout(3000);
  const all: string[] = [];
  all.push(...(await axe(page, "body+data")));

  // Keyboard only: Tab to the Heart button, Enter, Escape.
  const heart = page.getByRole("list", { name: "Body regions" }).getByRole("button", { name: /Heart/ });
  let reached = false;
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press("Tab");
    if (await heart.evaluate((el) => el === document.activeElement)) { reached = true; break; }
  }
  console.log("TAB-REACHED-HEART", reached);
  await page.keyboard.press("Enter");
  await expect(page.locator(".holo-panel")).toHaveCount(1);
  console.log("PANEL-TITLE", await page.locator("#body-part-panel-title").innerText());
  console.log("FOCUS-AFTER-ENTER", await page.evaluate(() => document.activeElement?.id));
  console.log("HEART-PRESSED", await heart.getAttribute("aria-pressed"));
  console.log("PANEL-TEXT-HAS-115", (await page.locator(".holo-panel").innerText()).includes("115"));
  await page.waitForTimeout(1500);
  all.push(...(await axe(page, "body+panel")));
  // Tab from the heading reaches the close button inside the panel.
  await page.keyboard.press("Tab");
  console.log("NEXT-TAB-LABEL", await page.evaluate(() => document.activeElement?.getAttribute("aria-label")));
  await page.keyboard.press("Escape");
  await expect(page.locator(".holo-panel")).toHaveCount(0);
  console.log("FOCUS-BACK-ON-HEART", await heart.evaluate((el) => el === document.activeElement));
  // Enter on another region replaces the panel (still exactly one).
  await page.getByRole("list", { name: "Body regions" }).getByRole("button", { name: /Kidneys/ }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".holo-panel")).toHaveCount(1);
  await page.getByRole("list", { name: "Body regions" }).getByRole("button", { name: /Mind/ }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#body-part-panel-title")).toHaveText("Mind");
  console.log("PANELS-AFTER-SWITCH", await page.locator(".holo-panel").count());
  await page.keyboard.press("Escape");

  // Crew overview drill-down (read-only Body tab).
  await openFromMore(page, "Crew overview");
  await page.waitForTimeout(1500);
  console.log("CREW-BUTTONS", JSON.stringify(await page.getByRole("button").allInnerTexts()));
  console.log("CREW-LINKS", JSON.stringify(await page.getByRole("main").getByRole("link").allInnerTexts()));
  await page.screenshot({ path: process.env.SHOTS + "/crew-1.png" });
  const row = page.getByRole("main").getByRole("button", { name: /Verify Cmdr/ }).first();
  if (await row.count()) await row.click();
  else await page.getByRole("main").getByText("Verify Cmdr").first().click();
  await page.waitForTimeout(1000);
  await page.getByRole("tab", { name: /Body/ }).or(page.getByRole("button", { name: /^Body$/ })).first().click();
  await expect(page.getByText("Loading body model…")).toHaveCount(0, { timeout: 60000 });
  await page.waitForTimeout(3000);
  await page.getByRole("list", { name: "Body regions" }).getByRole("button", { name: /Heart/ }).click();
  await expect(page.locator(".holo-panel")).toHaveCount(1);
  await page.waitForTimeout(2500);
  console.log("CREW-PANEL-HAS-115", (await page.locator(".holo-panel").innerText()).includes("115"));
  console.log("CREW-PANEL-INPUTS", await page.locator(".holo-root input, .holo-root textarea, .holo-root select").count());
  await page.screenshot({ path: process.env.SHOTS + "/crew-2.png" });
  all.push(...(await axe(page, "crew body")));
  console.log("ERRORS", JSON.stringify(errors));
  expect(all).toEqual([]);
});
