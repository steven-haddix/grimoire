import { registerOTel } from "@vercel/otel";
import { LangfuseExporter } from "langfuse-vercel";

const hasLangfuseKeys = Boolean(
  process.env.LANGFUSE_SECRET_KEY && process.env.LANGFUSE_PUBLIC_KEY,
);

export function register() {
  if (!hasLangfuseKeys) {
    return;
  }

  registerOTel({
    serviceName: "grimoire-bot",
    traceExporter: new LangfuseExporter(),
  });
}
