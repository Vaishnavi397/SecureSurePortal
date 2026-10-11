import { useState } from "react";
import { searchPolicies, errMsg } from "../services/api.js";

export default function PolicyPanel({ claim }) {
  const [q, setQ] = useState("coverage exclusions required documents claim limit");
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run() {
    setBusy(true); setError("");
    try { setResults((await searchPolicies(q, claim.claimType)).results); } catch (e) { setError(errMsg(e)); setResults(null); } finally { setBusy(false); }
  }
  return (
    <div className="card">
      <h3>Policy Search (RAG retrieval)</h3>
      <div className="row">
        <input value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn" disabled={busy || q.trim().length < 2} onClick={run}>{busy ? "Searching..." : `Search ${claim.claimType} policy`}</button>
      </div>
      {error && <div className="alert error">{error}</div>}
      {results && (results.length === 0 ? <p className="muted">No relevant policy clauses found.</p> : (
        <ul className="clauses">
          {results.map((r) => (
            <li key={r.chunkId}>
              <div><span className="badge clause">{r.clauseId}</span> <span className="muted small-text">{r.source} · score {r.score}</span></div>
              <div className="clause-text">{r.text.split("\n").slice(0).join(" ")}</div>
            </li>
          ))}
        </ul>
      ))}
    </div>
  );
}
