"use client";

import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  getToolName,
  isTextUIPart,
  isToolUIPart,
  type UIMessage,
} from "ai";
import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import { clearWebChat } from "@/app/actions/web-chat";
import { Diamond } from "@/components/grimoire/marks";
import { Topbar } from "@/components/grimoire/primitives";
import { Button } from "@/components/ui/button";
import { WEB_CHAT_INPUT_MAX_CHARS } from "@/lib/agents/web-chat-messages";

const STARTER_QUESTIONS = [
  "What happened last session?",
  "Recap the campaign so far.",
  "Which loose threads have we left dangling?",
];

// In-character labels for tool activity shown while the agent researches.
function toolActivityLabel(toolName: string, input: unknown): string {
  const query =
    input && typeof input === "object" && "query" in input
      ? String((input as { query?: unknown }).query ?? "")
      : "";
  switch (toolName) {
    case "searchCampaignHistory":
      return query
        ? `searching the record for “${query}”`
        : "searching the record";
    case "lookupCampaignEntities":
      return query
        ? `consulting the roster for “${query}”`
        : "consulting the roster";
    case "getCampaignContext":
      return "leafing through recent pages";
    default:
      return "consulting the record";
  }
}

function messageHasText(message: UIMessage | undefined): boolean {
  return Boolean(
    message?.parts.some((part) => isTextUIPart(part) && part.text.trim()),
  );
}

export function ChatView({
  campaignId,
  campaignName,
  initialMessages,
}: {
  campaignId: number;
  campaignName: string;
  initialMessages: UIMessage[];
}) {
  const [input, setInput] = React.useState("");
  const [clearing, setClearing] = React.useState(false);
  const endRef = React.useRef<HTMLDivElement | null>(null);

  const { messages, sendMessage, status, error, regenerate, setMessages } =
    useChat({
      messages: initialMessages,
      transport: new DefaultChatTransport({
        api: "/api/chat",
        body: { campaignId },
      }),
      onError: (err) => {
        toast.error(err.message || "Grimoire lost the thread. Try again.");
      },
    });

  const busy = status === "submitted" || status === "streaming";
  const hasMessages = messages.length > 0;
  const lastMessage = messages[messages.length - 1];
  // Show the "thinking" line until answer text actually starts arriving.
  const showActivity =
    status === "submitted" ||
    (status === "streaming" &&
      !(lastMessage?.role === "assistant" && messageHasText(lastMessage)));

  // biome-ignore lint/correctness/useExhaustiveDependencies: deps are re-run triggers — follow the stream as messages grow or the activity line toggles
  React.useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, showActivity]);

  const submit = (raw: string) => {
    const text = raw.trim();
    if (!text || busy) return;
    sendMessage({ text });
    setInput("");
  };

  const burnThePages = async () => {
    setClearing(true);
    try {
      await clearWebChat(campaignId);
      setMessages([]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not clear chat");
    } finally {
      setClearing(false);
    }
  };

  const composer = (
    <form
      className="chat-composer"
      onSubmit={(e) => {
        e.preventDefault();
        submit(input);
      }}
    >
      <div className="search" style={{ flex: 1, alignItems: "flex-start" }}>
        <Diamond size={6} />
        <textarea
          placeholder="Who was the innkeeper in Barrowmoor…"
          value={input}
          rows={2}
          maxLength={WEB_CHAT_INPUT_MAX_CHARS}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit(input);
            }
          }}
          style={{
            flex: 1,
            background: "transparent",
            border: 0,
            outline: 0,
            resize: "none",
            color: "inherit",
            font: "inherit",
          }}
        />
      </div>
      <Button type="submit" variant="primary" disabled={busy || !input.trim()}>
        {busy ? "Consulting…" : "Ask"}
      </Button>
    </form>
  );

  return (
    <>
      <Topbar
        crumbs={[
          { label: "GRIMOIRE", href: "/account" },
          { label: campaignName, href: `/account/c/${campaignId}` },
          { label: "Ask Grimoire" },
        ]}
        right={
          hasMessages ? (
            <button
              type="button"
              className="t-meta chat-clear"
              disabled={clearing || busy}
              onClick={burnThePages}
            >
              {clearing ? "burning…" : "burn the pages"}
            </button>
          ) : undefined
        }
      />

      <div className="chat-body">
        {hasMessages ? (
          <>
            <div className="chat-scroll">
              <div className="chat-thread">
                {messages.map((message) => (
                  <MessageCard key={message.id} message={message} />
                ))}

                {showActivity ? (
                  <ActivityLine
                    message={lastMessage}
                    busyLabel="Leafing through the record…"
                  />
                ) : null}

                {error ? (
                  <div className="chat-error">
                    <span
                      className="t-meta"
                      style={{ color: "var(--bone-dim)" }}
                    >
                      The pages fluttered shut mid-answer. The record survives —
                      ask again.
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => regenerate()}
                    >
                      Retry
                    </Button>
                  </div>
                ) : null}

                <div ref={endRef} />
              </div>
            </div>

            <div className="chat-input-dock">
              <div className="chat-input-dock__inner">{composer}</div>
            </div>
          </>
        ) : (
          <div className="chat-scroll">
            <div className="chat-empty">
              <div className="chat-empty__intro">
                <div className="t-eyebrow">
                  {campaignName} · the campaign record
                </div>
                <h1 className="t-display chat-empty__title">
                  Ask <em>Grimoire</em>
                </h1>
                <p className="chat-empty__sub">
                  Question the book itself. It recalls every session, summary,
                  and remembered fact in this campaign — and answers with all
                  the warmth of an immortal tome that has seen your dice rolls.
                </p>
              </div>
              <div className="chat-empty__composer">{composer}</div>
              <div className="chat-starters">
                {STARTER_QUESTIONS.map((q) => (
                  <Button
                    key={q}
                    type="button"
                    variant="ghost"
                    onClick={() => submit(q)}
                  >
                    {q}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function ActivityLine({
  message,
  busyLabel,
}: {
  message: UIMessage | undefined;
  busyLabel: string;
}) {
  // Surface the most recent tool call, if any, as the in-character status.
  const lastToolPart =
    message?.role === "assistant"
      ? [...message.parts].reverse().find((part) => isToolUIPart(part))
      : undefined;
  const label = lastToolPart
    ? toolActivityLabel(getToolName(lastToolPart), lastToolPart.input)
    : null;
  return (
    <div
      className="t-meta"
      style={{ color: "var(--bone-mute)", padding: "0 4px" }}
      aria-live="polite"
    >
      <span
        aria-hidden
        style={{
          marginRight: 8,
          color: "var(--copper)",
          animation: "blink 1s steps(2, end) infinite",
          display: "inline-block",
        }}
      >
        ✦
      </span>
      {label ?? busyLabel}
    </div>
  );
}

function MessageCard({ message }: { message: UIMessage }) {
  const isUser = message.role === "user";
  const toolParts = message.parts.filter((part) => isToolUIPart(part));
  return (
    <div
      style={{
        border: "0.5px solid var(--rule)",
        background: isUser ? "transparent" : "var(--ink-2)",
        padding: "16px 20px",
        marginLeft: isUser ? 80 : 0,
        marginRight: isUser ? 0 : 80,
      }}
    >
      <div
        className="t-meta"
        style={{
          color: isUser ? "var(--bone-mute)" : "var(--copper)",
          marginBottom: 8,
        }}
      >
        {isUser ? "You" : "Grimoire"}
      </div>
      {!isUser && toolParts.length > 0 ? (
        <div
          className="t-meta"
          style={{ color: "var(--bone-mute)", marginBottom: 8 }}
        >
          {toolParts
            .map((part) => toolActivityLabel(getToolName(part), part.input))
            .join(" · ")}
        </div>
      ) : null}
      {message.parts.map((part, i) => (
        <MessagePart key={`${message.id}-${i}`} part={part} isUser={isUser} />
      ))}
    </div>
  );
}

function MessagePart({
  part,
  isUser,
}: {
  part: UIMessage["parts"][number];
  isUser: boolean;
}) {
  if (!isTextUIPart(part) || !part.text.trim()) return null;
  if (isUser) {
    return (
      <div
        style={{
          whiteSpace: "pre-wrap",
          fontSize: 14,
          lineHeight: 1.6,
          color: "var(--bone)",
        }}
      >
        {part.text}
      </div>
    );
  }
  return (
    <div className="prose-grim" style={{ fontSize: 14 }}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{part.text}</ReactMarkdown>
    </div>
  );
}
