import { describe, expect, test } from "bun:test";
import { createSttProviderFromEnv } from "./index";
import { AssemblyAISttProvider } from "./providers/assemblyai";
import { DeepgramSttProvider } from "./providers/deepgram";
import { MistralSttProvider } from "./providers/mistral";
import { MistralRealtimeSttProvider } from "./providers/mistral-realtime";

describe("createSttProviderFromEnv", () => {
  test("defaults to deepgram provider", () => {
    const provider = createSttProviderFromEnv({
      DEEPGRAM_API_KEY: "dg-key",
    });

    expect(provider).toBeInstanceOf(DeepgramSttProvider);
  });

  test("creates assemblyai provider when configured", () => {
    const provider = createSttProviderFromEnv({
      STT_PROVIDER: "assemblyai",
      ASSEMBLYAI_API_KEY: "aa-key",
    });

    expect(provider).toBeInstanceOf(AssemblyAISttProvider);
  });

  test("creates mistral provider when configured", () => {
    const provider = createSttProviderFromEnv({
      STT_PROVIDER: "mistral",
      MISTRAL_API_KEY: "mistral-key",
    });

    expect(provider).toBeInstanceOf(MistralSttProvider);
  });

  test("creates mistral realtime provider when configured", () => {
    const provider = createSttProviderFromEnv({
      STT_PROVIDER: "mistral-realtime",
      MISTRAL_API_KEY: "mistral-key",
    });

    expect(provider).toBeInstanceOf(MistralRealtimeSttProvider);
  });

  test("throws on missing provider keys", () => {
    expect(() =>
      createSttProviderFromEnv({
        STT_PROVIDER: "mistral",
      }),
    ).toThrow("Missing MISTRAL_API_KEY");

    expect(() =>
      createSttProviderFromEnv({
        STT_PROVIDER: "assemblyai",
      }),
    ).toThrow("Missing ASSEMBLYAI_API_KEY");

    expect(() =>
      createSttProviderFromEnv({
        STT_PROVIDER: "deepgram",
      }),
    ).toThrow("Missing DEEPGRAM_API_KEY");
  });

  test("throws on unsupported provider", () => {
    expect(() =>
      createSttProviderFromEnv({
        STT_PROVIDER: "unknown",
      }),
    ).toThrow("Unsupported STT provider: unknown");
  });
});
