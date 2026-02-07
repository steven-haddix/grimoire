import { google } from "@ai-sdk/google";
import type { RuntimeDb } from "@grimoire/data/client";
import { getActiveCampaignId } from "@grimoire/data/repos/campaigns";
import { stepCountIs, ToolLoopAgent } from "ai";
import { agentInstructions } from "./prompt";
import { createGetCampaignContextTool } from "./tools/get-campaign-context";
import { persistBotReply, persistUserMessage } from "./tools/persist-chat";
import { createRememberFactTool } from "./tools/remember-fact";
import { createReplyTool } from "./tools/reply";
import { createSayTool } from "./tools/say";

export type AgentRequest = {
  guildId: string;
  channelId: string;
  userId: string;
  userName: string;
  userDisplayName: string;
  message: string;
};

export type AgentAction =
  | { type: "reply"; content: string }
  | { type: "say"; text: string; voice?: string };

export type AgentResult = {
  actions: AgentAction[];
  text?: string;
};

type GenerateResult = {
  text?: string;
};

type AgentGenerate = (params: {
  db: RuntimeDb;
  input: AgentRequest;
  actions: AgentAction[];
  activeCampaignId: number | null;
}) => Promise<GenerateResult>;

function buildPrompt(input: AgentRequest) {
  const message = input.message.trim() || "help";

  return [
    `Discord message from ${input.userDisplayName} (username: ${input.userName}, id: ${input.userId}).`,
    `Guild: ${input.guildId}. Channel: ${input.channelId}.`,
    `User message: ${message}`,
  ].join("\n");
}

async function defaultGenerate(params: {
  db: RuntimeDb;
  input: AgentRequest;
  actions: AgentAction[];
  activeCampaignId: number | null;
}): Promise<GenerateResult> {
  const { db, input, actions, activeCampaignId } = params;

  const agent = new ToolLoopAgent({
    model: google("gemini-3-flash-preview"),
    instructions: agentInstructions,
    stopWhen: stepCountIs(6),
    experimental_telemetry: {
      isEnabled: true,
      functionId: "discord-agent",
      metadata: {
        guildId: input.guildId,
        channelId: input.channelId,
        userId: input.userId,
      },
    },
    tools: {
      reply: createReplyTool(actions),
      say: createSayTool(actions),
      getCampaignContext: createGetCampaignContextTool(db, input.guildId),
      rememberFact: createRememberFactTool({
        db,
        activeCampaignId,
        defaultSource: input.userDisplayName || input.userName,
      }),
    },
  });

  const result = await agent.generate({
    prompt: buildPrompt(input),
  });

  return {
    text: result.text,
  };
}

export function createAgent(params: {
  db: RuntimeDb;
  generate?: AgentGenerate;
  resolveActiveCampaignId?: (
    db: RuntimeDb,
    guildId: string,
  ) => Promise<number | null>;
  persistUser?: typeof persistUserMessage;
  persistReply?: typeof persistBotReply;
}) {
  const {
    db,
    generate = defaultGenerate,
    resolveActiveCampaignId = getActiveCampaignId,
    persistUser = persistUserMessage,
    persistReply = persistBotReply,
  } = params;

  const run = async (input: AgentRequest): Promise<AgentResult> => {
    const activeCampaignId = await resolveActiveCampaignId(db, input.guildId);

    await persistUser({
      db,
      campaignId: activeCampaignId,
      guildId: input.guildId,
      channelId: input.channelId,
      userId: input.userId,
      displayName: input.userDisplayName || input.userName,
      content: input.message,
    });

    const actions: AgentAction[] = [];
    const result = await generate({
      db,
      input,
      actions,
      activeCampaignId,
    });

    const text = result.text?.trim();
    if (!actions.length && text) {
      actions.push({ type: "reply", content: text });
    }

    const replyAction = actions.find((action) => action.type === "reply");
    if (replyAction && replyAction.type === "reply") {
      await persistReply({
        db,
        campaignId: activeCampaignId,
        guildId: input.guildId,
        channelId: input.channelId,
        content: replyAction.content,
      });
    }

    console.log({
      agentInput: input,
      agentActions: actions,
      agentText: text,
    });

    return {
      actions,
      text,
    };
  };

  return { run };
}
