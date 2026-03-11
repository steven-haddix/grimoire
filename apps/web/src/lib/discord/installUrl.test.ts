import { describe, expect, test } from "bun:test";
import {
  buildDiscordBotInstallUrl,
  DEFAULT_BOT_INSTALL_PERMISSIONS,
} from "./installUrl";

describe("buildDiscordBotInstallUrl", () => {
  test("requests the permissions needed for voice playback and replies", () => {
    const url = new URL(
      buildDiscordBotInstallUrl({
        clientId: "client-123",
      }),
    );

    expect(url.searchParams.get("permissions")).toBe(
      String(DEFAULT_BOT_INSTALL_PERMISSIONS),
    );
  });
});
