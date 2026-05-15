"use client";

import { useState } from "react";
import ChatConversation from "./components/ChatConversation";
import ChatComposer from "./components/ChatComposer";
import WelcomeScreen from "./components/WelcomeScreen";
import { useChatStream } from "./hooks/useChatStream";

export default function HomePage() {
  const chat = useChatStream();
  const [input, setInput] = useState("");
  const [feedbackSent, setFeedbackSent] = useState(false);

  function handleSubmit(text: string) {
    if (!text.trim()) return;
    setInput("");
    setFeedbackSent(false);
    chat.submit(text.trim());
  }

  function handleScenarioSelect(prompt: string) {
    setInput("");
    setFeedbackSent(false);
    chat.submit(prompt);
  }

  async function handleFeedback(helpful: boolean) {
    let analysisId: string | undefined;
    for (let i = chat.messages.length - 1; i >= 0; i--) {
      if (chat.messages[i].metadata?.analysisId) {
        analysisId = chat.messages[i].metadata!.analysisId;
        break;
      }
    }
    if (!analysisId) return;

    setFeedbackSent(true);
    try {
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysisId, helpful }),
      });
    } catch { /* silent */ }
  }

  const hasMessages = chat.messages.length > 0;

  return (
    <main id="main-content" className="chat-app">
      <header className="chat-header">
        <div style={{ textAlign: "center" }}>
          <div className="chat-header__title">渝劳问答</div>
          <div className="chat-header__subtitle">重庆劳动法律顾问</div>
        </div>
      </header>

      {hasMessages ? (
        <ChatConversation
          messages={chat.messages}
          loading={chat.loading}
          onFeedback={handleFeedback}
          feedbackSent={feedbackSent}
        />
      ) : (
        <WelcomeScreen onScenarioSelect={handleScenarioSelect} />
      )}

      {chat.error && (
        <div className="error-bubble">
          {chat.error}
          <button type="button" onClick={chat.retry}>重试</button>
        </div>
      )}

      <ChatComposer
        onSubmit={handleSubmit}
        loading={chat.loading}
        onStop={chat.stop}
        suggestedReplies={chat.suggestedReplies}
        value={input}
        onChange={setInput}
      />
    </main>
  );
}
