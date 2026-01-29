/**
 * Splits a message into chunks that fit within Discord's character limit.
 * It tries to respect code blocks by closing them in one chunk and reopening them in the next.
 */
export function splitMessage(text: string, maxLength = 2000): string[] {
  const chunks = [];

  while (text.length > 0) {
    if (text.length <= maxLength) {
      chunks.push(text);
      break;
    }

    // Determine tentative split point
    let splitAt = text.lastIndexOf("\n", maxLength);
    if (splitAt === -1) splitAt = text.lastIndexOf(" ", maxLength);
    if (splitAt === -1) splitAt = maxLength;

    // Check for code blocks in the candidate chunk
    const chunkCandidate = text.substring(0, splitAt);
    const codeBlockCount = (chunkCandidate.match(/```/g) || []).length;

    // If odd, we are inside a code block
    if (codeBlockCount % 2 !== 0) {
      const closing = "\n```";

      // If adding closing tag exceeds limit, we must split earlier
      if (chunkCandidate.length + closing.length > maxLength) {
        const safeLimit = maxLength - closing.length;
        splitAt = text.lastIndexOf("\n", safeLimit);
        if (splitAt === -1) splitAt = text.lastIndexOf(" ", safeLimit);
        if (splitAt === -1) splitAt = safeLimit;
      }

      // Re-extract chunk with safe limit
      const finalChunkContent = text.substring(0, splitAt);

      // Find language for the next block
      // We look for the LAST occurrence of ``` in the chunk to find the opening of the current block
      const lastCodeBlockIndex = finalChunkContent.lastIndexOf("```");
      let lang = "";
      if (lastCodeBlockIndex !== -1) {
        const startOfLang = lastCodeBlockIndex + 3;
        const endOfLang = finalChunkContent.indexOf("\n", startOfLang);
        if (endOfLang !== -1) {
          lang = finalChunkContent.substring(startOfLang, endOfLang).trim();
        }
      }

      chunks.push(finalChunkContent + closing);

      const opening = "```" + lang + "\n";

      // Determine how to continue the text
      if (text[splitAt] === "\n") {
        // Skip the newline we split at
        text = opening + text.substring(splitAt + 1);
      } else if (text[splitAt] === " ") {
        // Skip the space we split at
        text = opening + text.substring(splitAt + 1);
      } else {
        // Hard split, don't skip char
        text = opening + text.substring(splitAt);
      }
    } else {
      // Not inside code block, normal split
      chunks.push(chunkCandidate);
      text = text.substring(splitAt).trimStart();
    }
  }

  return chunks;
}