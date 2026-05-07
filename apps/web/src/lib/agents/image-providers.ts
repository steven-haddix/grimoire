import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import { generateImage, generateText } from "ai";

export type GeneratedImage = {
  base64: string;
  mimeType: string;
};

type ImageProvider = "gemini" | "openai";

function resolvePrimary(): ImageProvider {
  return process.env.IMAGE_PROVIDER === "openai" ? "openai" : "gemini";
}

async function generateWithGemini(prompt: string): Promise<GeneratedImage> {
  const result = await generateText({
    model: google("gemini-3-pro-image-preview"),
    prompt,
  });
  const file = result.files?.[0];
  if (!file?.base64) {
    throw new Error("Gemini returned no image file");
  }
  return {
    base64: file.base64,
    mimeType: file.mediaType ?? "image/png",
  };
}

async function generateWithOpenAI(prompt: string): Promise<GeneratedImage> {
  const { image } = await generateImage({
    model: openai.image("gpt-image-2"),
    prompt,
    size: "1536x1024",
    providerOptions: {
      openai: { quality: "medium" },
    },
  });
  if (!image?.base64) {
    throw new Error("OpenAI returned no image");
  }
  return {
    base64: image.base64,
    mimeType: image.mediaType ?? "image/png",
  };
}

const providers: Record<
  ImageProvider,
  (prompt: string) => Promise<GeneratedImage>
> = {
  gemini: generateWithGemini,
  openai: generateWithOpenAI,
};

export async function generateIllustration(
  prompt: string,
): Promise<GeneratedImage> {
  const primary = resolvePrimary();
  const fallback: ImageProvider = primary === "gemini" ? "openai" : "gemini";

  try {
    return await providers[primary](prompt);
  } catch (primaryError) {
    console.error(
      `Illustration provider "${primary}" failed, falling back to "${fallback}"`,
      primaryError,
    );
    try {
      return await providers[fallback](prompt);
    } catch (fallbackError) {
      console.error(
        `Illustration fallback provider "${fallback}" also failed`,
        fallbackError,
      );
      throw fallbackError instanceof Error
        ? fallbackError
        : new Error("Image generation failed");
    }
  }
}
