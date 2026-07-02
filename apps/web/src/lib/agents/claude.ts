import { type AnthropicProviderOptions, anthropic } from "@ai-sdk/anthropic";

/**
 * Shared Claude configuration for the Discord agent and session summaries.
 *
 * Both run through the Vercel AI SDK, so switching providers is a matter of
 * swapping the model + provider options here rather than touching call sites.
 */

/** Claude model powering text generation across the app. */
export const CLAUDE_MODEL_ID = "claude-sonnet-5";

export const claudeModel = anthropic(CLAUDE_MODEL_ID);

/**
 * Reasoning effort for a Claude request. Sonnet 5 runs adaptive thinking (it
 * decides how much to reason per request); `effort` tunes that depth and the
 * overall token spend. Higher = more thorough but slower and pricier.
 */
export type ClaudeEffort = "low" | "medium" | "high" | "xhigh" | "max";

const VALID_EFFORTS: readonly ClaudeEffort[] = [
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
];

/**
 * Resolve an effort level from an env var, falling back when unset or invalid.
 * Lets us tune reasoning depth per environment without a redeploy.
 */
export function resolveClaudeEffort(
  rawValue: string | undefined,
  fallback: ClaudeEffort,
): ClaudeEffort {
  const normalized = rawValue?.trim().toLowerCase();
  return VALID_EFFORTS.includes(normalized as ClaudeEffort)
    ? (normalized as ClaudeEffort)
    : fallback;
}

/**
 * Build Vercel AI SDK provider options for a Claude request at the given effort.
 * Adaptive thinking is enabled explicitly; the deprecated `thinking.budgetTokens`
 * param is intentionally omitted because Sonnet 5 rejects it.
 */
export function claudeProviderOptions(effort: ClaudeEffort) {
  // `satisfies` (not an annotation) validates against the provider type while
  // keeping the inferred literal type JSON-narrow, which the SDK's
  // `providerOptions` (a JSON-object record) requires.
  const anthropic = {
    thinking: { type: "adaptive" },
    effort,
  } satisfies AnthropicProviderOptions;
  return { anthropic };
}
