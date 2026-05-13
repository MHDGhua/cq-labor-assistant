"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supportsSpeechRecognition } from "@/lib/utils/platform";

interface VoiceInputProps {
  onResult: (text: string) => void;
  disabled?: boolean;
}

interface SpeechRecognitionInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: { results: { [index: number]: { [index: number]: { transcript: string } } } }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

export default function VoiceInput({ onResult, disabled }: VoiceInputProps) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(true);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  useEffect(() => {
    setSupported(supportsSpeechRecognition());
  }, []);

  const toggle = useCallback(() => {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }

    const SpeechRecognitionCtor = (window as unknown as Record<string, unknown>).SpeechRecognition ||
      (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) {
      setSupported(false);
      return;
    }

    const recognition = new (SpeechRecognitionCtor as new () => SpeechRecognitionInstance)();
    recognition.lang = "zh-CN";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript;
      if (transcript) {
        onResult(transcript);
      }
      setListening(false);
    };

    recognition.onerror = () => {
      setListening(false);
    };

    recognition.onend = () => {
      setListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }, [listening, onResult]);

  if (!supported) {
    return null;
  }

  return (
    <button
      type="button"
      className={`voice-button ${listening ? "voice-button--active" : ""}`}
      onClick={toggle}
      disabled={disabled}
      title={listening ? "点击停止" : "语音输入"}
      aria-label={listening ? "停止语音输入" : "开始语音输入"}
    >
      {listening ? (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <rect x="4" y="4" width="12" height="12" rx="2" fill="currentColor"/>
        </svg>
      ) : (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path d="M10 1a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3Z" fill="currentColor"/>
          <path d="M5 9a5 5 0 0 0 10 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <path d="M10 14v4m-3 0h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      )}
      {listening ? <span className="voice-pulse"/> : null}
    </button>
  );
}
