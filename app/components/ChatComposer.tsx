"use client";

import { FormEvent, useRef, KeyboardEvent } from "react";

interface Props {
  onSubmit: (text: string) => void;
  loading: boolean;
  onStop: () => void;
  suggestedReplies: string[];
  value: string;
  onChange: (value: string) => void;
}

export default function ChatComposer({ onSubmit, loading, onStop, suggestedReplies, value, onChange }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const text = value.trim();
    if (!text || loading) return;
    onSubmit(text);
    onChange("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as FormEvent);
    }
  }

  function handleInput() {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 120) + "px";
    }
  }

  return (
    <div className="chat-composer">
      {suggestedReplies.length > 0 && !loading && (
        <div className="suggested-replies">
          {suggestedReplies.map((reply, i) => (
            <button key={i} type="button" onClick={() => onSubmit(reply)}>
              {reply}
            </button>
          ))}
        </div>
      )}
      <form className="composer-row" onSubmit={handleSubmit}>
        <label className="sr-only" htmlFor="chat-input">输入你的问题</label>
        <textarea
          ref={textareaRef}
          id="chat-input"
          className="composer-input"
          value={value}
          onChange={(e) => { onChange(e.target.value); handleInput(); }}
          onKeyDown={handleKeyDown}
          placeholder="描述你的劳动争议，或继续提问..."
          rows={1}
          disabled={loading}
        />
        {loading ? (
          <button className="composer-stop" type="button" onClick={onStop} aria-label="停止">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
          </button>
        ) : (
          <button className="composer-send" type="submit" disabled={!value.trim()} aria-label="发送">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        )}
      </form>
    </div>
  );
}
