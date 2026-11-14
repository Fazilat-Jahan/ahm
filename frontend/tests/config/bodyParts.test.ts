import { describe, expect, it } from "vitest";
import { BODY_PARTS, getBodyPart } from "@/config/bodyParts";
import { getIndicatorConfig } from "@/config/thresholds";
import { isSymptomId } from "@/config/symptoms";

describe("BODY_PARTS", () => {
  it("has unique ids", () => {
    const ids = BODY_PARTS.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("only references real config/thresholds.ts indicator ids", () => {
    for (const region of BODY_PARTS) {
      for (const indicatorId of region.indicators) {
        expect(
          getIndicatorConfig(indicatorId),
          `${region.id} references unknown indicator "${indicatorId}"`,
        ).toBeDefined();
      }
    }
  });

  it("only references real config/symptoms.ts symptom ids", () => {
    for (const region of BODY_PARTS) {
      for (const symptom of region.symptoms) {
        expect(
          isSymptomId(symptom),
          `${region.id} references unknown symptom "${symptom}"`,
        ).toBe(true);
      }
    }
  });

  it("gives every region at least one hazard, function text, and effect text", () => {
    for (const region of BODY_PARTS) {
      expect(region.hazards.length).toBeGreaterThan(0);
      expect(region.functionText.length).toBeGreaterThan(0);
      expect(region.spaceEffectText.length).toBeGreaterThan(0);
    }
  });

  it("gives every region a unique mesh name and at least one source link", () => {
    const meshNames = BODY_PARTS.map((r) => r.meshName);
    expect(new Set(meshNames).size).toBe(meshNames.length);
    for (const region of BODY_PARTS) {
      expect(region.meshName).toBe(region.id);
      expect(region.sources.length).toBeGreaterThan(0);
      for (const source of region.sources) {
        expect(source.label.length).toBeGreaterThan(0);
        expect(source.url).toMatch(/^https:\/\/www\.nasa\.gov\//);
      }
    }
  });

  it("links the kidneys to the hydration / water intake indicator", () => {
    const kidneys = getBodyPart("region_kidneys");
    expect(kidneys?.indicators).toEqual(["water_ml"]);
    expect(kidneys?.spaceEffectText).toMatch(/kidney stones/);
    expect(kidneys?.spaceEffectText).toMatch(/[Dd]ehydration/);
  });

  it("has no liver region (only added if the model has a liver mesh)", () => {
    expect(getBodyPart("region_liver")).toBeUndefined();
  });
});

describe("getBodyPart", () => {
  it("finds a region by id", () => {
    expect(getBodyPart("region_heart")?.label).toBe("Heart");
  });

  it("returns undefined for an unknown id", () => {
    expect(getBodyPart("region_nonexistent")).toBeUndefined();
  });
});
