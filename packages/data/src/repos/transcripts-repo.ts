import type { RuntimeDb } from "../client";
import { transcripts } from "../schema-runtime";

export type IngestTranscriptInput = {
  sessionId: number;
  speaker: string;
  text: string;
  timestamp?: string | number;
};

export async function ingestTranscript(
  db: RuntimeDb,
  input: IngestTranscriptInput,
) {
  const parsedTimestamp =
    input.timestamp !== undefined ? new Date(input.timestamp) : new Date();

  await db.insert(transcripts).values({
    sessionId: input.sessionId,
    speaker: input.speaker,
    content: input.text,
    timestamp: Number.isNaN(parsedTimestamp.getTime())
      ? new Date()
      : parsedTimestamp,
  });
}
