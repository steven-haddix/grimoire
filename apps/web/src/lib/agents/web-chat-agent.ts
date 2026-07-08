import { isStepCount, ToolLoopAgent } from "ai";
import {
  claudeModel,
  claudeProviderOptions,
  resolveClaudeEffort,
} from "@/lib/agents/claude";
import {
  createCampaignTools,
  GRIMOIRE_PERSONA,
  GRIMOIRE_TOOL_GUIDANCE,
} from "@/lib/agents/grimoire-core";

// Same reasoning-depth knob as the Discord agent.
const WEB_CHAT_EFFORT = resolveClaudeEffort(process.env.AGENT_EFFORT, "medium");

/**
 * The Grimoire agent for the web chat: shared persona + read-only campaign
 * tools, with web delivery rules — streamed text is the reply, markdown is
 * rendered, sessions are cited as links, and longer answers are welcome
 * (unlike Discord's brevity rules).
 */
export function createWebChatAgent(params: {
  campaignId: number;
  userId: string;
}) {
  const { campaignId, userId } = params;

  const instructions = [
    ...GRIMOIRE_PERSONA,
    "You are chatting with the campaign's keeper on the 'Ask Grimoire' page of the Grimoire web app.",
    "RESPONSES:",
    "- Answer directly in text; your reply is rendered as markdown.",
    "- Conversational by default; go long when the question calls for a recap or a detailed answer. Short paragraphs; lists or headings only when they genuinely help.",
    `- When you cite a specific session, link it in markdown as [Session N](/account/c/${campaignId}/sessions/<sessionId>), using the session ids your campaign research returns.`,
    "- If the record holds nothing on a question, say so in character rather than inventing details.",
    ...GRIMOIRE_TOOL_GUIDANCE,
  ].join(" ");

  return new ToolLoopAgent({
    model: claudeModel,
    instructions,
    stopWhen: isStepCount(6),
    providerOptions: claudeProviderOptions(WEB_CHAT_EFFORT),
    runtimeContext: {
      campaignId: String(campaignId),
      userId,
    },
    telemetry: {
      isEnabled: true,
      functionId: "web-chat-agent",
      includeRuntimeContext: {
        campaignId: true,
        userId: true,
      },
    },
    tools: createCampaignTools({ campaignId }),
  });
}
