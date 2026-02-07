import type { RuntimeDb } from "@grimoire/data/client";
import {
  createCampaign,
  listCampaigns,
  setActiveCampaignByName,
} from "@grimoire/data/repos/campaigns";
import type { AgentAction, AgentRequest } from "../agent/agent";
import type { BotConfig } from "../config";
import type { TtsVoiceConfig } from "../tts/types";
import type { CommandContext, CommandIntent, VoiceGateway } from "../types";
import type { SessionLifecycle } from "./session-lifecycle.types";
import type { TranscriptionService } from "./transcription-service";

export type BotController = {
  handleIntent: (intent: CommandIntent, ctx: CommandContext) => Promise<void>;
};

export type AgentRuntime = {
  run: (input: AgentRequest) => Promise<{ actions: AgentAction[] }>;
};

const HELP_MESSAGE = "Ask me about the session or say `/grim start`.";

function buildVoiceConfig(
  config: BotConfig,
  voiceOverride?: string,
): TtsVoiceConfig {
  return {
    voice: voiceOverride ?? config.ttsVoice,
    options: config.ttsVoiceOptions,
  };
}

function formatRecap(sessionId: number, recap: string | null) {
  if (!recap) {
    return `📜 Session #${sessionId} archived. I had too little transcript to summarize.`;
  }

  return `📜 Session #${sessionId} recap:\n${recap}`;
}

export function createBotController(params: {
  config: BotConfig;
  db: RuntimeDb;
  voice: VoiceGateway;
  transcription: TranscriptionService;
  sessionLifecycle: SessionLifecycle;
  agent: AgentRuntime;
}): BotController {
  const { config, db, voice, transcription, sessionLifecycle, agent } = params;

  const handleStart = async (ctx: CommandContext) => {
    if (!ctx.voiceChannelId) {
      await ctx.reply("Join a voice channel first.");
      return;
    }

    if (voice.isConnected(ctx.guildId)) {
      await ctx.reply("🟡 Already listening here. Use `/grim stop` first.");
      return;
    }

    try {
      await voice.startListening({
        guildId: ctx.guildId,
        channelId: ctx.voiceChannelId,
      });
    } catch (error) {
      console.error("Voice join failed", error);
      await ctx.reply("❌ Could not join the voice channel.");
      return;
    }

    try {
      const sessionId = await sessionLifecycle.start({
        guildId: ctx.guildId,
        channelId: ctx.voiceChannelId,
      });

      transcription.setSessionId(ctx.guildId, sessionId);

      await ctx.reply(
        `📜 **Session #${sessionId} Started.** I am listening...`,
      );
    } catch (error) {
      console.error(error);
      voice.stopListening(ctx.guildId);
      await ctx.reply(
        "❌ Could not start session. Check the database connection.",
      );
    }
  };

  const handleStop = async (ctx: CommandContext) => {
    const sessionId = transcription.getSessionId(ctx.guildId);
    voice.stopListening(ctx.guildId);

    if (!sessionId) {
      await ctx.reply("No active session to stop.");
      return;
    }

    await ctx.reply("🛑 Session ended. Summarizing...");

    try {
      const result = await sessionLifecycle.stop(sessionId);
      await ctx.reply(formatRecap(sessionId, result.recap));
    } catch (error) {
      console.error("Session stop failed", error);
      await ctx.reply(
        "❌ Session stop failed while persisting recap. Check database connectivity.",
      );
    } finally {
      transcription.clearSession(ctx.guildId);
    }
  };

  const handleRecap = async (ctx: CommandContext) => {
    if (!ctx.voiceChannelId) {
      await ctx.reply("Join a voice channel so I can speak the recap.");
      return;
    }

    await handleAgent(ctx, {
      type: "agent",
      message:
        "Please provide a dramatic, narrated recap of the previous session for the voice channel. Use the 'say' tool.",
    });
  };

  const handleSay = async (ctx: CommandContext, intent: CommandIntent) => {
    if (intent.type !== "say") return;

    if (!intent.text) {
      await ctx.reply("Usage: `/grim say` with a text prompt.");
      return;
    }

    if (!ctx.voiceChannelId) {
      await ctx.reply("Join a voice channel so I can speak.");
      return;
    }

    const voiceConfig = buildVoiceConfig(config, intent.voiceOverride);

    try {
      await voice.speak({
        guildId: ctx.guildId,
        voiceChannelId: ctx.voiceChannelId,
        text: intent.text,
        voice: voiceConfig,
        shouldDisconnect: !transcription.hasSession(ctx.guildId),
      });
    } catch (error) {
      console.error("TTS failed", error);
      await ctx.reply("❌ TTS failed. Check logs and provider config.");
    }
  };

  const handleAgent = async (ctx: CommandContext, intent: CommandIntent) => {
    if (intent.type !== "agent") return;

    try {
      const result = await agent.run({
        guildId: ctx.guildId,
        channelId: ctx.channelId,
        userId: ctx.userId,
        userName: ctx.userName,
        userDisplayName: ctx.userDisplayName,
        message: intent.message,
      });

      for (const action of result.actions) {
        if (action.type === "reply") {
          await ctx.reply(action.content);
          continue;
        }

        if (action.type === "say") {
          if (ctx.voiceChannelId) {
            const voiceConfig = buildVoiceConfig(config, action.voice);
            await voice.speak({
              guildId: ctx.guildId,
              voiceChannelId: ctx.voiceChannelId,
              text: action.text,
              voice: voiceConfig,
              shouldDisconnect: !transcription.hasSession(ctx.guildId),
            });
          } else {
            await ctx.reply(action.text);
          }
        }
      }
    } catch (error) {
      console.error("Agent request failed", error);
      await ctx.reply("❌ Agent request failed. Check logs.");
    }
  };

  const handleHelp = async (ctx: CommandContext) => {
    await ctx.reply(HELP_MESSAGE);
  };

  const handleCampaignCreate = async (
    ctx: CommandContext,
    name: string,
    description?: string,
  ) => {
    try {
      const campaign = await createCampaign(db, {
        guildId: ctx.guildId,
        name,
        description,
      });
      await ctx.reply(
        `✅ Created campaign **${campaign.name}**. It is now active.`,
      );
    } catch (error) {
      console.error("Campaign create failed", error);
      await ctx.reply("❌ Failed to create campaign.");
    }
  };

  const handleCampaignList = async (ctx: CommandContext) => {
    try {
      const { campaigns, activeCampaignId } = await listCampaigns(
        db,
        ctx.guildId,
      );
      if (campaigns.length === 0) {
        await ctx.reply("No campaigns found.");
        return;
      }

      const list = campaigns
        .map((campaign) => {
          const active = campaign.id === activeCampaignId ? " (Active) 🌟" : "";
          return `- **${campaign.name}**${active}: ${campaign.description || "No description"}`;
        })
        .join("\n");

      await ctx.reply(`**Campaigns:**\n${list}`);
    } catch (error) {
      console.error("Campaign list failed", error);
      await ctx.reply("❌ Failed to list campaigns.");
    }
  };

  const handleCampaignSelect = async (ctx: CommandContext, name: string) => {
    try {
      const campaign = await setActiveCampaignByName(db, {
        guildId: ctx.guildId,
        name,
      });

      if (!campaign) {
        await ctx.reply("❌ Failed to select campaign. Ensure it exists.");
        return;
      }

      await ctx.reply(`✅ Active campaign set to **${campaign.name}**.`);
    } catch (error) {
      console.error("Campaign select failed", error);
      await ctx.reply("❌ Failed to select campaign. Ensure it exists.");
    }
  };

  const handleIntent = async (intent: CommandIntent, ctx: CommandContext) => {
    if (intent.type === "help") {
      await handleHelp(ctx);
      return;
    }

    if (intent.type === "start") {
      await handleStart(ctx);
      return;
    }

    if (intent.type === "stop") {
      await handleStop(ctx);
      return;
    }

    if (intent.type === "recap") {
      await handleRecap(ctx);
      return;
    }

    if (intent.type === "say") {
      await handleSay(ctx, intent);
      return;
    }

    if (intent.type === "campaign_create") {
      await handleCampaignCreate(ctx, intent.name, intent.description);
      return;
    }

    if (intent.type === "campaign_list") {
      await handleCampaignList(ctx);
      return;
    }

    if (intent.type === "campaign_select") {
      await handleCampaignSelect(ctx, intent.name);
      return;
    }

    await handleAgent(ctx, intent);
  };

  return { handleIntent };
}
