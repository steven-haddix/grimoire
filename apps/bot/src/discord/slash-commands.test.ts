import { describe, expect, test } from "bun:test";
import { buildGrimCommands } from "./slash-commands";

describe("campaign schedule slash commands", () => {
  test("registers set, show, and remove under the schedule group", () => {
    const campaign = buildGrimCommands().find(
      (command) => command.name === "campaign",
    );
    const group = campaign?.options?.find(
      (option) => option.name === "schedule",
    );

    expect(group?.options?.map((option) => option.name)).toEqual([
      "set",
      "show",
      "remove",
    ]);
    const set = group?.options?.find((option) => option.name === "set");
    const weekday = set?.options?.find((option) => option.name === "weekday");
    expect(weekday?.choices).toHaveLength(7);
  });
});
