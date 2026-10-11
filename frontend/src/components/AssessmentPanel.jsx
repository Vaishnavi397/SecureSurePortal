import { useState } from "react";
import { generateAssessment, errMsg } from "../services/api.js";
import { dateTime, label } from "../utils/format.js";

const REC_CLASS = { LIKELY_COVERED: "ok", LIKELY_NOT_COVERED: "bad", NEEDS_MORE_INFORMATION: "warn", NEEDS_MANUAL_REVIEW: "warn" };

export default function AssessmentPanel({ claim, onUpdated }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const a = claim.assessment;

  async function run() {
    setBusy(true); setError("");
    try { onUpdated((await generateAssessment(claim.id)).claim); } catch (e) { setError(errMsg(e)); } finally { setBusy(false); }
  }
  return (
    <div className="card">
      <div className="row between">
        <h3>AI Assessment</h3>
        <button className="btn primary" disabled={busy} onClick={run}>{busy ? "Analysing..." : a ? "Re-generate assessment" : "Generate AI assessment"}</button>
      </div>
      <div className="alert info">Advisory only. The AI never approves or rejects a claim; the claims officer makes the final decision.</div>
      {error && <div className="alert error">{error}</div>}
      {!a && !busy && <p className="muted">No assessment yet.</p>}
      {a && (
        <div className="assessment">
          <div className="row">
            <span className={`badge rec-${REC_CLASS[a.recommendation]}`}>{label(a.recommendation)}</span>
            <span className="muted">Confidence {Math.round((a.confidence || 0) * 100)}%</span>
            <span className="muted small-text">Model: {a.model?.provider}/{a.model?.model} · {dateTime(a.generatedAt)}</span>
          </div>
          {a.model?.provider === "mock" && <div className="alert warn">Offline demo mode (rule-based, not a real LLM). Set an API key in backend/.env for GenAI assessments.</div>}
          <p><strong>Summary:</strong> {a.summary}</p>
          <p><strong>Reasoning:</strong> {a.reasoning}</p>
          <p><strong>Recommended action:</strong> {a.recommendedAction}</p>
          <div><strong>Missing information:</strong>{" "}
            {a.missingInformation?.length ? <ul>{a.missingInformation.map((m, i) => <li key={i}>{m}</li>)}</ul> : <span className="muted">None identified</span>}
          </div>
          <div><strong>Policy references (grounding):</strong>
            <ul>{a.policyReferences.map((r, i) => <li key={i}><span className="badge clause">{r.clauseId}</span> {r.relevance}</li>)}</ul>
          </div>
          <details>
            <summary>LangGraph workflow trace</summary>
            <p className="small-text">{a.workflow?.join(" → ")}</p>
            <p className="small-text">Retrieved clauses: {a.retrievedChunks?.map((c) => `${c.clauseId} (${c.score})`).join(", ")}</p>
          </details>
        </div>
      )}
    </div>
  );
}
