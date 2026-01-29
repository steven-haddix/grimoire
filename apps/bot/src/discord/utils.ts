/**
 * Splits a message into chunks that fit within Discord's character limit.
 */
export function splitMessage(text: string, maxLength = 2000): string[] {
  if (text.length <= maxLength) return [text];
  const chunks = [];

  while (text.length > maxLength) {
    let splitAt = text.lastIndexOf("\n", maxLength);
    if (splitAt === -1) {
      splitAt = text.lastIndexOf(" ", maxLength);
    }
    if (splitAt === -1) {
      splitAt = maxLength;
    }

    chunks.push(text.substring(0, splitAt));
    text = text.substring(splitAt).trimStart();
  }

  if (text.length > 0) {
    chunks.push(text);
  }

  return chunks;
}
