import { google } from "@ai-sdk/google";
import type { SessionContext } from "@grimoire/data/repos/sessions";
import { generateText } from "ai";

function buildTranscriptScript(context: SessionContext) {
  return context.transcript
    .map((line) => `${line.speaker}: ${line.content}`)
    .join("\n");
}

function buildCampaignContext(context: SessionContext) {
  if (!context.campaign) {
    return "";
  }

  const description = context.campaign.description
    ? `\nCampaign Description: ${context.campaign.description}`
    : "";

  return [
    "CAMPAIGN CONTEXT:",
    `Campaign Name: ${context.campaign.name}${description}`,
    "",
    "Use this campaign context to better understand the setting, characters, and ongoing storylines when summarizing the session.",
  ].join("\n");
}

export function createSessionSummarizer() {
  const summarize = async (context: SessionContext) => {
    if (context.transcript.length === 0) {
      throw new Error("Cannot summarize an empty transcript");
    }

    const script = buildTranscriptScript(context);
    const campaignContext = buildCampaignContext(context);

    const { text } = await generateText({
      model: google("gemini-3-flash-preview"),
      system:
        "You are a D&D scribe. Summarize the session with sections for Plot, Combat, and Loot.",
      prompt: `${campaignContext ? `${campaignContext}\n\n` : ""}TRANSCRIPT:\n${script}`,
      experimental_telemetry: {
        isEnabled: true,
        functionId: "summarize-session",
        metadata: {
          sessionId: context.sessionId,
          ...(context.campaign?.name && {
            campaignName: context.campaign.name,
          }),
        },
      },
    });

    return text.trim();
  };

  return { summarize };
}
