import { describe, expect, it } from "vitest";
import { stepTextZoom } from "./appearance";
import { textZoomDirection } from "./text-zoom";

function key(partial: Partial<KeyboardEvent>): KeyboardEvent {
  return {
    ctrlKey: true,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    key: "",
    code: "",
    ...partial,
  } as KeyboardEvent;
}

describe("text zoom", () => {
  it("steps by a tenth and stops at the edges", () => {
    expect(stepTextZoom(1, 1)).toBe(1.1);
    expect(stepTextZoom(1, -1)).toBe(0.9);
    expect(stepTextZoom(1.6, 1)).toBe(1.6);
    expect(stepTextZoom(0.7, -1)).toBe(0.7);
    expect(stepTextZoom(1.4, 0)).toBe(1);
  });

  it("reads ctrl plus, minus, and zero", () => {
    expect(textZoomDirection(key({ key: "+", code: "Equal" }))).toBe(1);
    expect(textZoomDirection(key({ key: "=", code: "Equal" }))).toBe(1);
    expect(textZoomDirection(key({ key: "-", code: "Minus" }))).toBe(-1);
    expect(textZoomDirection(key({ key: "0", code: "Digit0" }))).toBe(0);
    expect(textZoomDirection(key({ key: "k", code: "KeyK", shiftKey: true }))).toBeNull();
  });
});
