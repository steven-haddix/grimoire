export const PORTAL_SESSION_CHANNEL_ID = "portal-session";
export const MAX_NOTE_TEXT_CHARS = 20_000;
export const MAX_NOTE_FILES = 3;
export const MAX_NOTE_FILE_BYTES = 300_000;
export const ALLOWED_FILE_EXTENSIONS = new Set([
  "txt",
  "md",
  "markdown",
  "json",
  "csv",
  "log",
]);

export type NoteDraft = {
  content: string;
  source: string;
};

export type PortalSessionStatus = "active" | "completed";

export function parseOptionalInteger(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

export function parseRequiredInteger(
  value: FormDataEntryValue | null,
  field: string,
) {
  const parsed = parseOptionalInteger(value);

  if (!parsed) {
    throw new Error(`Missing ${field}`);
  }

  return parsed;
}

export function parseRequiredString(
  value: FormDataEntryValue | null,
  field: string,
) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Missing ${field}`);
  }

  return value.trim();
}

export function parseOccurredAt(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || value.trim() === "") {
    return new Date();
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Invalid session date");
  }

  return parsed;
}

export function parsePortalSessionStatus(
  value: FormDataEntryValue | null,
): PortalSessionStatus {
  if (value === "active" || value === "completed") {
    return value;
  }

  return "completed";
}

export function buildPortalSessionInsert(params: {
  guildId: string;
  campaignId: number | null;
  status: PortalSessionStatus;
  occurredAt: Date;
}) {
  return {
    guildId: params.guildId,
    channelId: PORTAL_SESSION_CHANNEL_ID,
    campaignId: params.campaignId,
    status: params.status,
    startedAt: params.occurredAt,
    endedAt: params.status === "completed" ? params.occurredAt : null,
  };
}

export function validateNoteContent(content: string, source: string) {
  const trimmed = content.trim();

  if (!trimmed) {
    return null;
  }

  if (trimmed.length > MAX_NOTE_TEXT_CHARS) {
    throw new Error(
      `${source} is too long. Keep each note under ${MAX_NOTE_TEXT_CHARS.toLocaleString()} characters.`,
    );
  }

  return trimmed;
}

export function hasAllowedExtension(fileName: string) {
  const extension = fileName.split(".").pop()?.toLowerCase();
  return extension ? ALLOWED_FILE_EXTENSIONS.has(extension) : false;
}

export async function extractNotes(params: {
  noteText: FormDataEntryValue | null;
  files: FormDataEntryValue[];
  requireAtLeastOne?: boolean;
}) {
  const drafts: NoteDraft[] = [];

  if (typeof params.noteText === "string") {
    const content = validateNoteContent(params.noteText, "Note");

    if (content) {
      drafts.push({
        content,
        source: "Portal note",
      });
    }
  }

  const files = params.files.filter(
    (value): value is File => value instanceof File && value.size > 0,
  );

  if (files.length > MAX_NOTE_FILES) {
    throw new Error(`Upload up to ${MAX_NOTE_FILES} files at a time.`);
  }

  for (const file of files) {
    if (file.size > MAX_NOTE_FILE_BYTES) {
      throw new Error(
        `${file.name} is too large. Keep uploads under ${(MAX_NOTE_FILE_BYTES / 1000).toFixed(0)} KB.`,
      );
    }

    if (!file.type.startsWith("text/") && !hasAllowedExtension(file.name)) {
      throw new Error(
        `${file.name} is not supported. Upload text, markdown, csv, json, or log files.`,
      );
    }

    const content = validateNoteContent(await file.text(), file.name);

    if (content) {
      drafts.push({
        content,
        source: file.name,
      });
    }
  }

  if (params.requireAtLeastOne && !drafts.length) {
    throw new Error("Add some notes or upload a text file.");
  }

  return drafts;
}
