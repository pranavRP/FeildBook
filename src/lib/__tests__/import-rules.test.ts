import { describe, expect, it } from "vitest";
import {
  armsRequired,
  createVenueAnonymizer,
  extractIteration,
  inferStatus,
  normalizeInstruction,
  parseProps,
  sceneNameFrom,
} from "../import-rules";

describe("normalizeInstruction", () => {
  it("lowercases, trims, collapses whitespace and trailing dots", () => {
    expect(normalizeInstruction("  Take green apple out  of the bowl. ")).toBe("take green apple out of the bowl");
  });
});

describe("sceneNameFrom", () => {
  it("uses the text before the first colon", () => {
    expect(sceneNameFrom("Storage room metal shelving 01: red bins, loose cables")).toBe("Storage room metal shelving 01");
  });
  it("falls back to the first 60 chars without a colon", () => {
    expect(sceneNameFrom("Folding table with two stacked green crates")).toBe("Folding table with two stacked green crates");
  });
});

describe("parseProps", () => {
  it("splits scene vs buy segments and items", () => {
    expect(parseProps("Scene: cardboard box | Buy: handheld tape dispenser with packing tape, 3 cups")).toEqual([
      { name: "Cardboard box", qty: 1, source: "at_scene" },
      { name: "Handheld tape dispenser with packing tape", qty: 1, source: "to_buy" },
      { name: "Cups", qty: 3, source: "to_buy" },
    ]);
  });
  it("keeps commas inside parentheses and treats unprefixed items as at-scene", () => {
    expect(parseProps("Soda cans (2-3 flavors), fridge shelf")).toEqual([
      { name: "Soda cans (2-3 flavors)", qty: 1, source: "at_scene" },
      { name: "Fridge shelf", qty: 1, source: "at_scene" },
    ]);
  });
  it("dedupes case-insensitively and ignores blanks", () => {
    expect(parseProps("scene: Red bin, red bin, ")).toEqual([{ name: "Red bin", qty: 1, source: "at_scene" }]);
    expect(parseProps(null)).toEqual([]);
  });
});

describe("inferStatus", () => {
  it("prioritises done, then ready, then comments", () => {
    expect(inferStatus({ done: true, inReadySheet: true, comments: "impossible" })).toBe("done");
    expect(inferStatus({ done: false, inReadySheet: true, comments: "impossible" })).toBe("ready");
    expect(inferStatus({ done: false, inReadySheet: false, comments: "impossible, has new iteration" })).toBe("infeasible");
    expect(inferStatus({ done: false, inReadySheet: false, comments: "feasible but have some concerns" })).toBe(
      "feasibility_test",
    );
    expect(inferStatus({ done: false, inReadySheet: false, comments: "needs testing" })).toBe("feasibility_test");
    expect(inferStatus({ done: false, inReadySheet: false, comments: "possible" })).toBe("proposed");
  });
});

describe("extractIteration", () => {
  it("extracts clear replacement instructions", () => {
    expect(extractIteration("NEW ITERATION: Take off lid from pot (light lid)")).toEqual({
      instruction: "Take off lid from pot (light lid)",
      reason: "NEW ITERATION: Take off lid from pot (light lid)",
    });
    expect(extractIteration("New iteration: unplug ethernet cable from netgear, coil the cable")?.instruction).toBe(
      "Unplug ethernet cable from netgear, coil the cable",
    );
  });
  it("returns null for ambiguous notes", () => {
    expect(extractIteration("NEW iteration: can coil but it has to be thick wire")).toBeNull();
    expect(extractIteration("New iteration: ??????")).toBeNull();
    expect(extractIteration("new iteration (replaced): ")).toBeNull();
    expect(extractIteration("scene changed")).toBeNull();
  });
});

describe("armsRequired", () => {
  it("detects two-handed tasks", () => {
    expect(armsRequired("Take bowl out of microwave with both hands")).toBe(2);
    expect(armsRequired("Put bowl into microwave")).toBe(1);
  });
});

describe("createVenueAnonymizer", () => {
  it("maps venues to stable neutral names", () => {
    const anon = createVenueAnonymizer(true);
    expect(anon("Calder RWC Office")).toBe("Office Site A");
    expect(anon("Davies Appliance")).toBe("Showroom B");
    expect(anon("Sound Union")).toBe("Venue C");
    expect(anon("calder rwc office")).toBe("Office Site A");
    expect(createVenueAnonymizer(false)("Davies Appliance")).toBe("Davies Appliance");
  });
});
