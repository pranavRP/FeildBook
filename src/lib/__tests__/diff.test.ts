import { describe, expect, it } from "vitest";
import { diffWords } from "../diff";

describe("diffWords", () => {
  it("marks removed and added words", () => {
    expect(diffWords("Put lid on Dutch oven", "Take off lid from pot")).toEqual([
      { type: "removed", text: "Put" },
      { type: "added", text: "Take off" },
      { type: "same", text: "lid" },
      { type: "removed", text: "on Dutch oven" },
      { type: "added", text: "from pot" },
    ]);
  });
  it("returns a single same part for identical text", () => {
    expect(diffWords("a b c", "a b c")).toEqual([{ type: "same", text: "a b c" }]);
  });
});
