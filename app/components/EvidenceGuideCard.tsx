"use client";

import { useState } from "react";
import { getRelevantGuides, type EvidenceGuide } from "@/lib/data/evidence-guides";

interface EvidenceGuideCardProps {
  citations: { kind: string; title: string }[];
}

export default function EvidenceGuideCard({ citations }: EvidenceGuideCardProps) {
  const [expanded, setExpanded] = useState(false);

  const evidenceTypes = citations
    .filter((c) => c.kind === "case")
    .map((c) => c.title);

  const guides = getRelevantGuides(evidenceTypes);

  if (guides.length === 0) return null;

  return (
    <div className="evidence-guide">
      <button
        type="button"
        className="expand-button"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? "收起证据保全指南 ↑" : "查看证据怎么保存 ↓"}
      </button>

      {expanded && (
        <div className="evidence-guide__content">
          {guides.map((guide) => (
            <GuideSection key={guide.type} guide={guide} />
          ))}
        </div>
      )}
    </div>
  );
}

function GuideSection({ guide }: { guide: EvidenceGuide }) {
  return (
    <div className="guide-section">
      <h4 className="guide-section__title">{guide.label}</h4>
      {guide.urgent ? (
        <p className="guide-urgent">{guide.urgent}</p>
      ) : null}
      <ol className="guide-steps">
        {guide.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
    </div>
  );
}
