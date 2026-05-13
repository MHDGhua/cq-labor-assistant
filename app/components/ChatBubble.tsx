"use client";

import { useState } from "react";
import type { ChatMessage } from "../hooks/useChatStream";

export default function ChatBubble({ message }: { message: ChatMessage }) {
  const [showCitations, setShowCitations] = useState(false);

  if (message.type === "typing") {
    return (
      <div className="bubble-row bubble-row--ai">
        <div className="bubble bubble--ai bubble--typing">
          <span /><span /><span />
        </div>
      </div>
    );
  }

  if (message.role === "system") {
    return (
      <div className="bubble-row" style={{ alignSelf: "center", maxWidth: "90%" }}>
        <div style={{ fontSize: 12, color: "var(--muted)", textAlign: "center", padding: "4px 12px" }}>
          {message.content}
        </div>
      </div>
    );
  }

  const isUser = message.role === "user";
  const rowClass = `bubble-row ${isUser ? "bubble-row--user" : "bubble-row--ai"}`;
  const bubbleClass = `bubble ${isUser ? "bubble--user" : "bubble--ai"}`;

  return (
    <div className={rowClass}>
      <div className={bubbleClass}>
        {message.type === "steps" && message.metadata?.steps ? (
          <>
            <span>{message.content}</span>
            <ol className="bubble__steps">
              {message.metadata.steps.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
          </>
        ) : message.type === "citations" && message.metadata?.citations ? (
          <>
            <button
              className="bubble__citations-toggle"
              onClick={() => setShowCitations(!showCitations)}
            >
              {showCitations ? "收起" : "查看"}法律依据（{message.metadata.citations.length}条）
            </button>
            {showCitations && (
              <ul className="bubble__citations-list">
                {message.metadata.citations.map((c, i) => (
                  <li key={i}>
                    <a href={c.url} target="_blank" rel="noopener noreferrer">{c.title}</a>
                    {c.label ? ` - ${c.label}` : ""}
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <span style={{ whiteSpace: "pre-wrap" }}>{message.content}</span>
        )}
      </div>
    </div>
  );
}
