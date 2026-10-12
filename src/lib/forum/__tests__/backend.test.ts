import { describe, expect, it } from "vitest";
import { forumConfig } from "../backend";

describe("forumConfig", () => {
  it("is off without a Supabase project", () => {
    expect(forumConfig({})).toEqual({ mode: "off" });
    expect(forumConfig({ VITE_SUPABASE_URL: "https://x.supabase.co" })).toEqual({ mode: "off" });
    expect(forumConfig({ VITE_SUPABASE_URL: "  ", VITE_SUPABASE_ANON_KEY: "  " })).toEqual({ mode: "off" });
  });
  it("uses Supabase when both values are set (trimmed)", () => {
    expect(forumConfig({ VITE_SUPABASE_URL: " https://x.supabase.co ", VITE_SUPABASE_ANON_KEY: " key " })).toEqual({ mode: "supabase", url: "https://x.supabase.co", anonKey: "key" });
  });
  it("runs the in-memory fake only when asked, and ahead of Supabase", () => {
    expect(forumConfig({ VITE_FORUM_MOCK: "1" })).toEqual({ mode: "mock" });
    expect(forumConfig({ VITE_FORUM_MOCK: "1", VITE_SUPABASE_URL: "https://x", VITE_SUPABASE_ANON_KEY: "k" })).toEqual({ mode: "mock" });
    expect(forumConfig({ VITE_FORUM_MOCK: "0" })).toEqual({ mode: "off" });
  });
});
