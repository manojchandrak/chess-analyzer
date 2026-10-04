import { describe, expect, it } from "vitest";
import { PERSONAS } from "../personas";
import { accentOf, availableAccents, chooseVoice, englishVoices, isNaturalVoice, shortVoiceName, voicesForAccent, type VoiceInfo } from "../voices";

const v = (name: string, lang: string, voiceURI = name.toLowerCase().split(" ")[1] ?? name.toLowerCase(), extra: Partial<VoiceInfo> = {}): VoiceInfo => ({ name, lang, voiceURI, ...extra });

// A device with Microsoft Edge "Natural" voices, a few classic system voices and a novelty voice.
const DEVICE: VoiceInfo[] = [
  v("Microsoft Libby Online (Natural) - English (United Kingdom)", "en-GB", "libby"),
  v("Microsoft Ryan Online (Natural) - English (United Kingdom)", "en-GB", "ryan"),
  v("Microsoft Jenny Online (Natural) - English (United States)", "en-US", "jenny"),
  v("Microsoft Guy Online (Natural) - English (United States)", "en-US", "guy"),
  v("Microsoft Natasha Online (Natural) - English (Australia)", "en-AU", "natasha"),
  v("Microsoft Connor Online (Natural) - English (Ireland)", "en-IE", "connor"),
  v("Microsoft Neerja Online (Natural) - English (India)", "en-IN", "neerja"),
  v("Microsoft Florian Multilingual Online (Natural) - German (Germany)", "de-DE", "florian"),
  v("Anna", "de-DE", "anna"),
  v("Daniel", "en-GB", "daniel"),
  v("Alex", "en-US", "alex", { default: true }),
  v("Bells", "en-US", "bells"),
  v("Kyoko", "ja-JP", "kyoko"),
];

describe("accentOf", () => {
  it("maps language tags to accents", () => {
    expect(accentOf(v("x", "en-US"))).toBe("us");
    expect(accentOf(v("x", "en_GB"))).toBe("gb");
    expect(accentOf(v("x", "en-scotland"))).toBe("gb");
    expect(accentOf(v("x", "en-AU"))).toBe("au");
    expect(accentOf(v("x", "en-IE"))).toBe("ie");
    expect(accentOf(v("x", "en-IN"))).toBe("in");
    expect(accentOf(v("x", "en-ZA"))).toBe("za");
    expect(accentOf(v("x", "en-CA"))).toBe("ca");
    expect(accentOf(v("x", "en-NZ"))).toBe("nz");
    expect(accentOf(v("x", "de-DE"))).toBe("eu");
    expect(accentOf(v("x", "fr_FR"))).toBe("eu");
    expect(accentOf(v("x", "ja-JP"))).toBeNull();
  });
});

describe("available accents and voices", () => {
  it("lists only the accents the device has, with the best voice for each", () => {
    const list = availableAccents(DEVICE);
    expect(list.map((a) => a.id)).toEqual(["us", "gb", "au", "ie", "in", "eu"]);
    expect(list.find((a) => a.id === "gb")).toMatchObject({ count: 3, label: "British" });
    expect(list.find((a) => a.id === "au")?.best.voiceURI).toBe("natasha");
  });
  it("puts natural voices before classic ones and skips novelty voices", () => {
    expect(voicesForAccent(DEVICE, "gb").map((x) => x.voiceURI)).toEqual(["libby", "ryan", "daniel"]);
    expect(voicesForAccent(DEVICE, "us").some((x) => x.voiceURI === "bells")).toBe(false);
    expect(englishVoices(DEVICE).some((x) => x.voiceURI === "bells" || x.voiceURI === "kyoko")).toBe(false);
  });
  it("prefers multilingual voices for the European accent", () => {
    expect(voicesForAccent(DEVICE, "eu").map((x) => x.voiceURI)).toEqual(["florian", "anna"]);
  });
  it("knows which voices sound natural", () => {
    expect(isNaturalVoice(DEVICE[0])).toBe(true);
    expect(isNaturalVoice(v("Anna", "de-DE"))).toBe(false);
    expect(shortVoiceName(DEVICE[0].name)).toBe("Libby");
  });
});

describe("chooseVoice", () => {
  const pick = (persona: string, accent?: Parameters<typeof chooseVoice>[1]["accent"]) => chooseVoice(DEVICE, { persona, accent });

  it("gives each persona a voice that suits it in its own accent", () => {
    expect(pick("analyst").voice?.voiceURI).toBe("libby");
    expect(pick("master").voice?.voiceURI).toBe("ryan");
    expect(pick("coach").voice?.voiceURI).toBe("jenny");
    expect(pick("commentator").voice?.voiceURI).toBe("guy");
    expect(PERSONAS.every((p) => pick(p.id).voice)).toBe(true);
  });

  it("uses the chosen accent for any persona", () => {
    for (const p of PERSONAS) {
      expect(pick(p.id, "au")).toMatchObject({ voice: { voiceURI: "natasha" }, accent: "au", fellBack: false });
      expect(pick(p.id, "ie").voice?.voiceURI).toBe("connor");
      expect(pick(p.id, "in").voice?.voiceURI).toBe("neerja");
      expect(pick(p.id, "eu").voice?.voiceURI).toBe("florian");
    }
  });

  it("falls back to the best English voice when the device lacks the accent", () => {
    const r = pick("coach", "za");
    expect(r.fellBack).toBe(true);
    expect(r.voice?.voiceURI).toBe("jenny");
  });

  it("lets a specifically chosen voice win over accent and persona", () => {
    expect(chooseVoice(DEVICE, { persona: "analyst", accent: "au", voiceURI: "anna" }).voice?.voiceURI).toBe("anna");
    expect(chooseVoice(DEVICE, { persona: "analyst", voiceURI: "gone" }).voice?.voiceURI).toBe("libby"); // a stale choice is ignored
  });

  it("copes with a device that has no voices", () => {
    expect(chooseVoice([], { persona: "analyst" })).toEqual({ voice: undefined, accent: null, fellBack: false });
  });
});
