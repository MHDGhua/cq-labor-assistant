"use client";

import { useEffect, useRef } from "react";
import type { ChatMessage } from "../hooks/useChatStream";
import ChatBubble from "./ChatBubble";

interface Props {
  messages: ChatMessage[];
  loading: boolean;
  onFeedback?: (helpful: boolean) => void;
  feedbackSent?: boolean;
}

export default function ChatConversation({ messages, loading, onFeedback, feedbackSent }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const lastAiIdx = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant" && messages[i].type !== "typing") return i;
    }
    return -1;
  })();
  const showFeedback = !loading && lastAiIdx >= 0 && messages[lastAiIdx].type === "citations";

  return (
    <div className="chat-messages" role="log" aria-live="polite">
      {messages.map((msg, i) => (
        <ChatBubble key={msg.id} message={msg} />
      ))}
      {showFeedback && onFeedback && (
        <div className="feedback-row">
          {feedbackSent ? (
            <span className="feedback-msg">已收到反馈</span>
          ) : (
            <>
              <button className="feedback-btn" onClick={() => onFeedback(true)}>有帮助</button>
              <button className="feedback-btn" onClick={() => onFeedback(false)}>不太对</button>
            </>
          )}
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}
