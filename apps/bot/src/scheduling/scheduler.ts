import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type Client,
} from "discord.js";
import type { BotApi, ScheduledJob } from "../api/bot-api";
import type { BotController } from "../services/bot-controller";

const DEFAULT_POLL_INTERVAL_MS = 15_000;
const START_REMINDER_GRACE_MS = 60 * 60_000;

type JobPayload = {
  guildId: string;
  channelId: string;
  sessionId?: number;
  campaignName?: string;
  occurrenceAt?: string;
};

function parsePayload(job: ScheduledJob): JobPayload {
  const guildId = job.payload.guildId;
  const channelId = job.payload.channelId;
  const sessionId = job.payload.sessionId;
  const campaignName = job.payload.campaignName;
  const occurrenceAt = job.payload.occurrenceAt;

  if (typeof guildId !== "string" || typeof channelId !== "string") {
    if (job.type === "summarize_session") {
      return {
        guildId: "",
        channelId: "",
        sessionId:
          typeof sessionId === "number" && Number.isInteger(sessionId)
            ? sessionId
            : undefined,
      };
    }
    throw new Error(`Job ${job.id} has an invalid Discord destination`);
  }

  return {
    guildId,
    channelId,
    sessionId:
      typeof sessionId === "number" && Number.isInteger(sessionId)
        ? sessionId
        : undefined,
    campaignName: typeof campaignName === "string" ? campaignName : undefined,
    occurrenceAt: typeof occurrenceAt === "string" ? occurrenceAt : undefined,
  };
}

export function shouldDeliverStartReminder(
  occurrenceAt: Date,
  now: Date,
  graceMs = START_REMINDER_GRACE_MS,
) {
  const lateness = now.getTime() - occurrenceAt.getTime();
  return lateness >= 0 && lateness <= graceMs;
}

async function getSendableChannel(client: Client, channelId: string) {
  const channel = await client.channels.fetch(channelId);
  if (!channel?.isSendable()) {
    throw new Error(`Discord channel ${channelId} is not sendable`);
  }
  return channel;
}

export async function processScheduledJob(input: {
  job: ScheduledJob;
  api: BotApi;
  client: Client;
  controller: BotController;
  now?: Date;
}) {
  const { job, api, client, controller } = input;
  const now = input.now ?? new Date();
  const payload = parsePayload(job);

  if (job.type === "game_start_reminder") {
    const occurrenceAt = payload.occurrenceAt
      ? new Date(payload.occurrenceAt)
      : new Date(job.runAt);
    if (
      !Number.isFinite(occurrenceAt.getTime()) ||
      !shouldDeliverStartReminder(occurrenceAt, now)
    ) {
      return;
    }

    const channel = await getSendableChannel(client, payload.channelId);
    const timestamp = Math.floor(occurrenceAt.getTime() / 1000);
    const components = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`grim:start:${job.id}`)
        .setLabel("Start recording")
        .setEmoji("📜")
        .setStyle(ButtonStyle.Success),
    );
    await channel.send({
      content: `🎲 **${payload.campaignName ?? "Game time"}** is scheduled to begin now (<t:${timestamp}:R>). Join a voice channel and start the scribe.`,
      components: [components],
    });
    return;
  }

  if (job.type === "session_stop_reminder") {
    if (!payload.sessionId) throw new Error("Stop reminder has no sessionId");
    const { session } = await api.getSessionState(payload.sessionId);
    if (session.guildId !== payload.guildId) {
      throw new Error("Stop reminder guild does not match its session");
    }
    if (session.status !== "active") return;

    const channel = await getSendableChannel(client, payload.channelId);
    const components = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`grim:stop:${payload.sessionId}`)
        .setLabel("Stop & summarize")
        .setEmoji("🛑")
        .setStyle(ButtonStyle.Danger),
    );
    await channel.send({
      content:
        "⏳ This session has been recording for three hours. Stop now, or I’ll stop automatically in one hour.",
      components: [components],
    });
    return;
  }

  if (job.type === "session_auto_stop") {
    if (!payload.sessionId) throw new Error("Auto-stop job has no sessionId");
    const { session } = await api.getSessionState(payload.sessionId);
    if (session.guildId !== payload.guildId) {
      throw new Error("Auto-stop guild does not match its session");
    }
    if (session.status !== "active") return;

    // The safety stop must never depend on the announcement channel: resolve
    // and send inside the reply so an unsendable channel can't block the stop.
    await controller.stopSessionById({
      guildId: payload.guildId,
      channelId: payload.channelId,
      sessionId: payload.sessionId,
      reason: "max_duration",
      reply: async (content) => {
        try {
          const channel = await getSendableChannel(client, payload.channelId);
          await channel.send({ content });
        } catch (error) {
          console.error("Auto-stop announcement failed", {
            jobId: job.id,
            error,
          });
        }
      },
    });
    return;
  }

  if (job.type === "summarize_session") {
    if (!payload.sessionId) throw new Error("Summary job has no sessionId");
    await api.summarizeSession(payload.sessionId);
    return;
  }

  throw new Error(`Unknown scheduled job type: ${job.type}`);
}

export function createScheduler(input: {
  client: Client;
  api: BotApi;
  controller: BotController;
  pollIntervalMs?: number;
}) {
  const workerId = `${process.pid}:${crypto.randomUUID()}`;
  const pollIntervalMs = input.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running = false;
  let polling = false;
  let lastSuccessfulPollAt: Date | null = null;

  const scheduleNextPoll = () => {
    if (!running) return;
    timer = setTimeout(() => void poll(), pollIntervalMs);
  };

  const poll = async () => {
    if (!running || polling) return;
    polling = true;
    try {
      const jobs = await input.api.claimScheduledJobs({ workerId, limit: 10 });
      await Promise.all(
        jobs.map(async (job) => {
          try {
            await processScheduledJob({ ...input, job });
          } catch (error) {
            const message =
              error instanceof Error ? error.message : "Unknown job failure";
            console.error("Scheduled job failed", { jobId: job.id, message });
            try {
              await input.api.failScheduledJob(job.id, workerId, message);
            } catch (failError) {
              console.error("Could not record scheduled job failure", {
                jobId: job.id,
                error: failError,
              });
            }
            return;
          }
          try {
            await input.api.completeScheduledJob(job.id, workerId);
          } catch (error) {
            // The job's side effects already ran; failing it back to pending
            // would re-send Discord messages. Leave the lease to expire.
            console.error("Could not acknowledge completed job", {
              jobId: job.id,
              error,
            });
          }
        }),
      );
      lastSuccessfulPollAt = new Date();
    } catch (error) {
      console.error("Scheduler poll failed", error);
    } finally {
      polling = false;
      scheduleNextPoll();
    }
  };

  return {
    start() {
      if (running) return;
      running = true;
      void poll();
    },
    stop() {
      running = false;
      if (timer) clearTimeout(timer);
      timer = null;
    },
    health() {
      return {
        running,
        polling,
        lastSuccessfulPollAt: lastSuccessfulPollAt?.toISOString() ?? null,
      };
    },
  };
}

export type Scheduler = ReturnType<typeof createScheduler>;
