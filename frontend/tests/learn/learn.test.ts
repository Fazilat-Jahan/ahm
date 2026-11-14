import "fake-indexeddb/auto";
import { readdirSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  ADAPTATION_RULE_DAYS,
  ADAPTATION_SOFTEN_DAYS,
  ENVIRONMENT_CONFIGS,
  isGravityChange,
} from "@/config/environments";
import { HAZARDS } from "@/config/hazards";
import { getLearnTopicForIndicator, LEARN_TOPICS } from "@/config/learn";
import { isSymptomId } from "@/config/symptoms";
import { getIndicatorConfig, THRESHOLDS } from "@/config/thresholds";
import { RISKS } from "@/content/risks";
import { getRiskInputLabel, RISK_CREW_ACTIONS } from "@/content/riskGuidance";
import { HAZARD_SOURCES, RISK_SOURCES, uniqueSources } from "@/content/sources";
import { buildMissionContext } from "@/lib/db/missionContext";
import { changeAstronautEnvironment, registerAstronaut } from "@/lib/db/repo";
import { getDb } from "@/lib/db/schema";
import { loadLearnContent } from "@/lib/learn/content";
import {
  formatBandRange,
  getRangeRows,
  LEARN_SECTION_HEADINGS,
  parseLearnMarkdown,
} from "@/lib/learn/parse";
import { evaluate } from "@/lib/rules/engine";
import {
  applyModifiers,
  isWithinAdaptationWindow,
} from "@/lib/rules/modifiers";
import {
  ENVIRONMENTS,
  type Flag,
  type MissionContext,
} from "@/lib/rules/types";

describe("Learn content (content/learn/*.md)", () => {
  it("has exactly one .md file per topic, and no stray files", () => {
    const files = readdirSync(path.join(process.cwd(), "content", "learn"))
      .filter((f) => f.endsWith(".md"))
      .map((f) => f.replace(/\.md$/, ""))
      .sort();
    expect(files).toEqual(LEARN_TOPICS.map((t) => t.slug).sort());
  });

  it("every file has the three required sections with real text", async () => {
    for (const topic of LEARN_TOPICS) {
      const content = await loadLearnContent(topic.slug);
      expect(content, topic.slug).toBeDefined();
      expect(content?.sections.map((s) => s.heading)).toEqual([
        ...LEARN_SECTION_HEADINGS,
      ]);
      for (const section of content?.sections ?? []) {
        expect(section.paragraphs.join(" ").length).toBeGreaterThan(60);
      }
    }
  });

  it("content files contain no numbers that could drift from the thresholds", async () => {
    // Ranges live only in config/thresholds.ts. Prose may say "1/6" or
    // "3/8" style words but must not carry a clinical value with a unit.
    for (const topic of LEARN_TOPICS) {
      const content = await loadLearnContent(topic.slug);
      const text = (content?.sections ?? [])
        .flatMap((s) => s.paragraphs)
        .join(" ");
      expect(text, topic.slug).not.toMatch(
        /\d+\s?(bpm|mmHg|mg\/dL|°C|%|mSv|mL|mg|hours?\b)/,
      );
    }
  });

  it("returns undefined for an unknown topic", async () => {
    expect(await loadLearnContent("not-a-topic")).toBeUndefined();
  });

  it("every topic references real indicators, risks and sources", () => {
    for (const topic of LEARN_TOPICS) {
      expect(topic.indicatorIds.length).toBeGreaterThan(0);
      for (const id of topic.indicatorIds) {
        expect(getIndicatorConfig(id), `${topic.slug}: ${id}`).toBeDefined();
      }
      for (const riskId of topic.riskIds) {
        expect(RISKS.some((r) => r.id === riskId)).toBe(true);
        expect(RISK_SOURCES[riskId]).toBeDefined();
      }
    }
  });

  it("every banded indicator has a Learn page", () => {
    for (const indicator of THRESHOLDS) {
      expect(
        getLearnTopicForIndicator(indicator.id),
        indicator.id,
      ).toBeDefined();
    }
  });
});

describe("parseLearnMarkdown / ranges", () => {
  it("splits sections and joins wrapped lines into paragraphs", () => {
    const sections = parseLearnMarkdown(
      "## One\n\nfirst line\nsecond line\n\nnext paragraph\n\n## Two\n\nonly\n",
    );
    expect(sections).toEqual([
      {
        heading: "One",
        paragraphs: ["first line second line", "next paragraph"],
      },
      { heading: "Two", paragraphs: ["only"] },
    ]);
  });

  it("formats bands exactly as configured", () => {
    expect(formatBandRange({ status: "green", min: 50, max: 100 })).toBe(
      "50 to 100",
    );
    expect(formatBandRange({ status: "critical", min: 131 })).toBe(
      "131 or more",
    );
    expect(formatBandRange({ status: "red", max: 39 })).toBe("39 or less");
    expect(formatBandRange({ status: "yellow", min: 3, max: 3 })).toBe("3");
  });

  it("groups heart-rate bands by status, green first", () => {
    const rows = getRangeRows(getIndicatorConfig("heart_rate")?.bands ?? []);
    expect(rows.map((r) => r.status)).toEqual([
      "green",
      "yellow",
      "red",
      "critical",
    ]);
    expect(rows[0].ranges).toEqual(["50 to 100"]);
    expect(rows[1].ranges).toEqual(["40 to 49", "101 to 110"]);
  });
});

describe("Risks page content", () => {
  it("covers all 17 risks with crew actions and a NASA source each", () => {
    expect(RISKS).toHaveLength(17);
    for (const risk of RISKS) {
      expect(
        RISK_CREW_ACTIONS[risk.id]?.length,
        `risk ${risk.id}`,
      ).toBeGreaterThan(20);
      expect(RISK_SOURCES[risk.id].url).toMatch(/^https:\/\/www\.nasa\.gov\//);
      expect(risk.summary.length).toBeGreaterThan(20);
    }
  });

  it("labels every tracked input in plain words", () => {
    for (const risk of RISKS) {
      for (const input of risk.trackedVia) {
        const label = getRiskInputLabel(input);
        expect(label, input).not.toMatch(/_/);
        expect(label.length).toBeGreaterThan(2);
      }
    }
  });

  it("de-duplicates sources by URL", () => {
    const a = HAZARD_SOURCES.gravity;
    expect(uniqueSources([a, RISK_SOURCES[3], a])).toEqual([
      a,
      RISK_SOURCES[3],
    ]);
  });

  it("has all five hazards", () => {
    expect(HAZARDS.map((h) => h.id).sort()).toEqual(
      Object.keys(HAZARD_SOURCES).sort(),
    );
  });
});

describe("environment config", () => {
  it("has a tip pack, emphasis and real symptoms for all five environments", () => {
    for (const id of ENVIRONMENTS) {
      const config = ENVIRONMENT_CONFIGS[id];
      expect(config.id).toBe(id);
      expect(config.tips.length).toBeGreaterThanOrEqual(3);
      expect(config.emphasis.length).toBeGreaterThanOrEqual(3);
      expect(config.hazards.length).toBeGreaterThan(0);
      for (const symptom of config.watchSymptoms) {
        expect(isSymptomId(symptom), `${id}: ${symptom}`).toBe(true);
      }
      for (const tip of config.tips) {
        expect(tip.length, tip).toBeLessThanOrEqual(140);
      }
    }
  });

  it("environments differ in emphasis and tips", () => {
    expect(ENVIRONMENT_CONFIGS.rover.tips).not.toEqual(
      ENVIRONMENT_CONFIGS.moon_base.tips,
    );
    expect(ENVIRONMENT_CONFIGS.rover.emphasis).toContain("Motion sickness");
    expect(ENVIRONMENT_CONFIGS.moon_base.emphasis.join(" ")).toMatch(/Dust/);
  });

  it("a gravity change is a move between microgravity and partial gravity", () => {
    expect(isGravityChange("spacecraft", "mars_base")).toBe(true);
    expect(isGravityChange("station", "rover")).toBe(true);
    expect(isGravityChange("spacecraft", "station")).toBe(false);
    expect(isGravityChange("moon_base", "rover")).toBe(false);
  });
});

describe("mission-phase modifiers and the environment", () => {
  const base: MissionContext = { environment: "mars_base", missionDay: 200 };

  it("adaptation window: early mission, or the days after a gravity change", () => {
    expect(isWithinAdaptationWindow({ ...base, missionDay: 3 }, 3)).toBe(true);
    expect(isWithinAdaptationWindow(base, 3)).toBe(false);
    expect(
      isWithinAdaptationWindow({ ...base, daysSinceGravityChange: 3 }, 3),
    ).toBe(true);
    expect(
      isWithinAdaptationWindow({ ...base, daysSinceGravityChange: 4 }, 3),
    ).toBe(false);
    expect(ADAPTATION_RULE_DAYS).toBe(3);
    expect(ADAPTATION_SOFTEN_DAYS).toBe(7);
  });

  const flag = (status: Flag["status"]): Flag => ({
    id: "TEST-SOFTEN-01",
    status,
    message: "test",
    hazard: "gravity",
    causedBySymptoms: ["dizziness"],
  });
  const soften = (status: Flag["status"], mission: MissionContext) =>
    applyModifiers(
      { indicators: [], flags: [flag(status)], trends: [] },
      mission,
    ).flags.length;

  it("softens yellow only, in every environment, inside the window", () => {
    for (const environment of ENVIRONMENTS) {
      const inWindow: MissionContext = {
        environment,
        missionDay: 200,
        daysSinceGravityChange: 5,
      };
      expect(soften("yellow", inWindow), environment).toBe(0);
      expect(soften("red", inWindow), environment).toBe(1);
      expect(soften("critical", inWindow), environment).toBe(1);
      expect(soften("green", inWindow), environment).toBe(1);
    }
  });

  it("softens nothing outside the window", () => {
    expect(soften("yellow", base)).toBe(1);
    expect(soften("yellow", { ...base, daysSinceGravityChange: 8 })).toBe(1);
  });

  it("a real critical result is untouched by the adaptation window", () => {
    const result = evaluate({
      log: { date: "2026-06-15", spo2: 85 },
      symptoms: [
        { symptom: "dizziness", severity: 1 },
        { symptom: "nausea_vomiting", severity: 1 },
      ],
      history: [],
      mission: { environment: "spacecraft", missionDay: 2 },
    });
    expect(result.overall).toBe("critical");
    expect(result.indicators.find((i) => i.id === "spo2")?.status).toBe(
      "critical",
    );
  });
});

describe("changing environment (repo + mission context)", () => {
  beforeEach(async () => {
    const db = getDb();
    await Promise.all([db.astronauts.clear(), db.outbox.clear()]);
  });

  const register = () =>
    registerAstronaut({
      name: "Test One",
      crewCode: "TST-001",
      role: "astronaut",
      environment: "spacecraft",
      missionStart: "2026-01-01",
      pin: "1234",
    });

  it("a fresh astronaut has no gravity change", async () => {
    const a = await register();
    expect(buildMissionContext(a, "2026-07-10")).toEqual({
      environment: "spacecraft",
      missionDay: 191,
    });
  });

  it("micro -> partial gravity records the date and enqueues an outbox row", async () => {
    const a = await register();
    await getDb().outbox.clear();
    const next = await changeAstronautEnvironment(
      a.id,
      "mars_base",
      "2026-07-10",
    );
    expect(next).toMatchObject({
      environment: "mars_base",
      gravityChangedOn: "2026-07-10",
      version: 2,
    });
    const outbox = await getDb().outbox.toArray();
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({ entity: "astronaut", op: "upsert" });

    expect(
      buildMissionContext(next!, "2026-07-10").daysSinceGravityChange,
    ).toBe(1);
    expect(
      buildMissionContext(next!, "2026-07-12").daysSinceGravityChange,
    ).toBe(3);
    // A backdated check-in for a day before the change: no window.
    expect(
      buildMissionContext(next!, "2026-07-09").daysSinceGravityChange,
    ).toBeUndefined();
  });

  it("a move within the same gravity class records no gravity change", async () => {
    const a = await register();
    const next = await changeAstronautEnvironment(
      a.id,
      "station",
      "2026-07-10",
    );
    expect(next?.environment).toBe("station");
    expect(next?.gravityChangedOn).toBeUndefined();
  });

  it("only changes the astronaut it was asked to change", async () => {
    const a = await register();
    const b = await registerAstronaut({
      name: "Test Two",
      crewCode: "TST-002",
      role: "astronaut",
      environment: "station",
      missionStart: "2026-01-01",
      pin: "1234",
    });
    await changeAstronautEnvironment(a.id, "rover", "2026-07-10");
    expect((await getDb().astronauts.get(b.id))?.environment).toBe("station");
  });

  it("end to end: the environment change turns on CMB-SAM-01 for 3 days", async () => {
    const a = await register();
    const symptoms = [
      { symptom: "nausea_vomiting" as const, severity: 1 as const },
      { symptom: "dizziness" as const, severity: 1 as const },
    ];
    const run = (astronaut: typeof a, date: string) =>
      evaluate({
        log: { date },
        symptoms,
        history: [],
        mission: buildMissionContext(astronaut, date),
      }).flags.map((f) => f.id);

    expect(run(a, "2026-07-10")).toEqual([]);
    const moved = await changeAstronautEnvironment(
      a.id,
      "mars_base",
      "2026-07-10",
    );
    expect(run(moved!, "2026-07-10")).toEqual(["CMB-SAM-01"]);
    expect(run(moved!, "2026-07-12")).toEqual(["CMB-SAM-01"]);
    expect(run(moved!, "2026-07-13")).toEqual([]);
  });
});
