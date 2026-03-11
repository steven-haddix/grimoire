import { describe, expect, test } from "bun:test";
import {
  buildPortalSessionInsert,
  extractNotes,
  parsePortalSessionStatus,
} from "./portal-session";

describe("portal session helpers", () => {
  test("defaults unknown status values to completed", () => {
    expect(parsePortalSessionStatus("active")).toBe("active");
    expect(parsePortalSessionStatus("completed")).toBe("completed");
    expect(parsePortalSessionStatus("something-else")).toBe("completed");
    expect(parsePortalSessionStatus(null)).toBe("completed");
  });

  test("builds active and completed session rows correctly", () => {
    const occurredAt = new Date("2026-03-11T10:30:00.000Z");

    expect(
      buildPortalSessionInsert({
        guildId: "guild-1",
        campaignId: 42,
        status: "active",
        occurredAt,
      }),
    ).toEqual({
      guildId: "guild-1",
      channelId: "portal-session",
      campaignId: 42,
      status: "active",
      startedAt: occurredAt,
      endedAt: null,
    });

    expect(
      buildPortalSessionInsert({
        guildId: "guild-1",
        campaignId: null,
        status: "completed",
        occurredAt,
      }),
    ).toEqual({
      guildId: "guild-1",
      channelId: "portal-session",
      campaignId: null,
      status: "completed",
      startedAt: occurredAt,
      endedAt: occurredAt,
    });
  });

  test("extracts notes from textarea and uploaded files", async () => {
    const notes = await extractNotes({
      noteText: "  Party allied with the goblins.  ",
      files: [
        new File(["Loot: silver key"], "session-notes.txt", {
          type: "text/plain",
        }),
      ],
      requireAtLeastOne: true,
    });

    expect(notes).toEqual([
      {
        content: "Party allied with the goblins.",
        source: "Portal note",
      },
      {
        content: "Loot: silver key",
        source: "session-notes.txt",
      },
    ]);
  });

  test("rejects unsupported uploads and empty required submissions", async () => {
    await expect(
      extractNotes({
        noteText: null,
        files: [],
        requireAtLeastOne: true,
      }),
    ).rejects.toThrow("Add some notes or upload a text file.");

    await expect(
      extractNotes({
        noteText: null,
        files: [
          new File(["binary"], "map.pdf", {
            type: "application/pdf",
          }),
        ],
        requireAtLeastOne: true,
      }),
    ).rejects.toThrow("map.pdf is not supported.");
  });
});
