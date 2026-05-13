"use client";

import type { HistoryEntry } from "../hooks/useLocalHistory";

interface HistoryPanelProps {
  history: HistoryEntry[];
  onClear: () => void;
}

export default function HistoryPanel({ history, onClear }: HistoryPanelProps) {
  if (history.length === 0) return null;

  return (
    <div className="history-panel">
      <div className="history-panel__head">
        <strong>上次的分析</strong>
        <button type="button" className="link-button" onClick={onClear}>
          清除记录
        </button>
      </div>
      <ul className="history-list">
        {history.map((entry) => (
          <li key={entry.id} className="history-item">
            <span className={`history-dot history-dot--${entry.riskLevel}`} />
            <div>
              <p className="history-headline">{entry.headline}</p>
              <small className="history-meta">
                {entry.scenarioLabel} · {formatTime(entry.timestamp)}
              </small>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "刚刚";
  if (diffMin < 60) return `${diffMin}分钟前`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}小时前`;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
