import { describe, expect, it } from "vitest";
import { normalizeSettings } from "./settings";

describe("settings", () => {
  it("keeps saved notes options and fills appearance defaults", () => {
    const settings = normalizeSettings({
      vault: "C:/notes",
      ollamaHost: "http://127.0.0.1:11434",
      model: "qwen",
      editModel: "gemma",
      autocomplete: true,
    });
    expect(settings.vault).toBe("C:/notes");
    expect(settings.model).toBe("qwen");
    expect(settings.editModel).toBe("gemma");
    expect(settings.decisionModel).toBe("tev1:0.8b-q8_0");
    expect(settings.syntaxOpacity).toBe(0.55);
    expect(settings.autocomplete).toBe(true);
    expect(settings.colorMode).toBe("dark");
    expect(settings.palette).toBe("ink");
    expect(settings.font).toBe("roboto");
    expect(settings.contentWidth).toBe("comfortable");
    expect(settings.textZoom).toBe(1);
    expect(settings.appearanceRev).toBe(2);
  });

  it("keeps independent decision settings and clamps marker opacity", () => {
    const settings = normalizeSettings({ model: "complete", editModel: "edit", decisionModel: "tev1:4b-q4_K_M", syntaxOpacity: 0.4, frostedGlass: true });
    expect(settings.decisionModel).toBe("tev1:4b-q4_K_M");
    expect(settings.model).toBe("complete"); expect(settings.editModel).toBe("edit");
    expect(settings.syntaxOpacity).toBe(0.4); expect(settings.frostedGlass).toBe(false);
    expect(normalizeSettings({ syntaxOpacity: NaN }).syntaxOpacity).toBe(0.55);
    expect(normalizeSettings({ syntaxOpacity: 3 }).syntaxOpacity).toBe(1);
    expect(normalizeSettings({ syntaxOpacity: -1 }).syntaxOpacity).toBe(0.15);
  });

  it("moves an old full-width system save onto the centered Roboto default once", () => {
    const settings = normalizeSettings({
      font: "system",
      contentWidth: "full",
      textZoom: 2.4,
    });
    expect(settings.font).toBe("roboto");
    expect(settings.contentWidth).toBe("comfortable");
    expect(settings.textZoom).toBe(1.6);
  });

  it("widens the previous narrow default without touching a later full-width choice", () => {
    const widened = normalizeSettings({ appearanceRev: 1, contentWidth: "narrow", font: "roboto" });
    expect(widened.contentWidth).toBe("comfortable");
    const kept = normalizeSettings({ appearanceRev: 2, font: "system", contentWidth: "full" });
    expect(kept.font).toBe("system");
    expect(kept.contentWidth).toBe("full");
  });

  it("drops unknown appearance values", () => {
    const settings = normalizeSettings({
      colorMode: "sepia" as "dark",
      palette: "nope" as "ink",
      fontSize: "huge" as "default",
      reduceMotion: true,
    });
    expect(settings.colorMode).toBe("dark");
    expect(settings.palette).toBe("ink");
    expect(settings.fontSize).toBe("default");
    expect(settings.reduceMotion).toBe(true);
  });
});
