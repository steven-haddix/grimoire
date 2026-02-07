import { describe, expect, test } from "bun:test";
import type { RuntimeDb } from "@grimoire/data/client";
import { type AgentAction, createAgent } from "./agent";

const noopDb = {} as RuntimeDb;

const baseInput = {
  guildId: "guild-1",
  channelId: "chan-1",
  userId: "user-1",
  userName: "steven",
  userDisplayName: "Steven",
  message: "hello",
};

describe("createAgent", () => {
  test("persists user and bot reply messages when active campaign exists", async () => {
    const persisted: Array<{ type: "user" | "bot"; content: string }> = [];

    const agent = createAgent({
      db: noopDb,
      resolveActiveCampaignId: async () => 42,
      persistUser: async (input) => {
        persisted.push({ type: "user", content: input.content });
      },
      persistReply: async (input) => {
        persisted.push({ type: "bot", content: input.content });
      },
      generate: async ({ actions }) => {
        actions.push({ type: "reply", content: "grim answer" });
        return { text: "ignored" };
      },
    });

    const result = await agent.run(baseInput);

    expect(result.actions).toEqual([{ type: "reply", content: "grim answer" }]);
    expect(persisted).toEqual([
      { type: "user", content: "hello" },
      { type: "bot", content: "grim answer" },
    ]);
  });

  test("falls back to plain text response when tools emit no actions", async () => {
    const actionsSeen: AgentAction[] = [];

    const agent = createAgent({
      db: noopDb,
      resolveActiveCampaignId: async () => null,
      persistUser: async () => {},
      persistReply: async () => {},
      generate: async ({ actions }) => {
        actionsSeen.push(...actions);
        return { text: "fallback response" };
      },
    });

    const result = await agent.run(baseInput);

    expect(actionsSeen).toHaveLength(0);
    expect(result.actions).toEqual([
      { type: "reply", content: "fallback response" },
    ]);
  });
});
