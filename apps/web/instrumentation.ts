import { registerOTel } from "@vercel/otel";
import { LangfuseExporter } from "langfuse-vercel";

const hasLangfuseKeys = Boolean(
  process.env.LANGFUSE_SECRET_KEY && process.env.LANGFUSE_PUBLIC_KEY,
);

export function register() {
  if (!hasLangfuseKeys) {
    console.log("Langfuse keys not found, skipping OTel registration");
    return;
  }

  registerOTel({
    serviceName: "grimoire-bot",
    traceExporter: new LangfuseExporter(),
  });
}
