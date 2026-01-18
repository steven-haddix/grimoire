import type { CommandIntent } from "../types";

export type CommandParseResult = {
  intent: CommandIntent | null;
  isCommand: boolean;
};

const DEFAULT_PREFIX = "!scribe";

export function parseCommand(
  content: string,
  prefix = DEFAULT_PREFIX,
): CommandParseResult {
  const trimmed = content.trim();
  if (!trimmed.startsWith(prefix)) {
    return { intent: null, isCommand: false };
  }

  const afterPrefix = trimmed.slice(prefix.length).trim();
  if (!afterPrefix) {
    return { intent: { type: "help" }, isCommand: true };
  }

  const [command, ...args] = afterPrefix.split(/\s+/);

  if (command === "start") {
    return { intent: { type: "start" }, isCommand: true };
  }

  if (command === "stop") {
    return { intent: { type: "stop" }, isCommand: true };
  }

  if (command === "say") {
    const { text, voiceOverride } = parseSayArgs(args);
    return {
      intent: { type: "say", text, voiceOverride },
      isCommand: true,
    };
  }

  return { intent: { type: "agent", message: afterPrefix }, isCommand: true };
}

function parseSayArgs(args: string[]) {
  if (args.length === 0) {
    return { text: "", voiceOverride: undefined };
  }

  if (args[0] === "--voice" && args[1]) {
    const voiceOverride = args[1];
    const text = args.slice(2).join(" ").trim();
    return { text, voiceOverride };
  }

  return { text: args.join(" ").trim(), voiceOverride: undefined };
}
