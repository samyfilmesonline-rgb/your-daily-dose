import { describe, it, expect } from "vitest";
import { cleanWorkspaceName, normalizeWorkspaceKey, dedupeWorkspaces, stripAvatarPrefix } from "@/lib/workspace-name";

describe("workspace-name", () => {
  it("strips duplicated avatar prefix", () => {
    expect(cleanWorkspaceName("Cclose's Lovablee")).toBe("close's Lovablee");
    expect(cleanWorkspaceName("Ddoug's Lovable")).toBe("doug's Lovable");
    expect(cleanWorkspaceName("AAlex's Lovable")).toBe("Alex's Lovable");
  });
  it("leaves clean names alone", () => {
    expect(cleanWorkspaceName("Alex's Lovable")).toBe("Alex's Lovable");
    expect(stripAvatarPrefix("Close")).toBe("Close");
  });
  it("normalizes curly quotes and spaces", () => {
    expect(cleanWorkspaceName("  alex\u2019s   Lovable  ")).toBe("alex's Lovable");
  });
  it("key ignores accents and plan suffix", () => {
    expect(normalizeWorkspaceKey("José's Lovable PRO")).toBe(normalizeWorkspaceKey("jose's lovable"));
  });
  it("dedupes by normalized key, keeps first", () => {
    const out = dedupeWorkspaces(["AAlex's Lovable", "alex's lovable PRO", "", "Ddoug's Lovable"]);
    expect(out).toEqual(["Alex's Lovable", "doug's Lovable"]);
  });
});