import { useState } from "react";
import { updateStatus, errMsg } from "../services/api.js";
import { label } from "../utils/format.js";

export default function StatusControl({ claim, allowed, onUpdated }) {
  const [next, setNext] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setBusy(true);
    setError("");
    try {
      onUpdated(await updateStatus(claim.id, next, note || undefined));
      setNext("");
      setNote("");
    } catch (e) { setError(errMsg(e)); } finally { setBusy(false); }
  }
  return (
    <div className="card">
      <h3>Update Status</h3>
      {allowed.length === 0 ? <p className="muted">No further transitions: claim is {label(claim.status)}.</p> : (
        <>
          <div className="row">
            <select value={next} onChange={(e) => setNext(e.target.value)}>
              <option value="">Select next status...</option>
              {allowed.map((s) => <option key={s} value={s}>{label(s)}</option>)}
            </select>
            <input placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
            <button className="btn primary" disabled={!next || busy} onClick={submit}>{busy ? "Saving..." : "Update"}</button>
          </div>
          {error && <div className="alert error">{error}</div>}
        </>
      )}
      {claim.statusHistory?.length > 0 && (
        <details>
          <summary>Status history ({claim.statusHistory.length})</summary>
          <ul className="history">
            {[...claim.statusHistory].reverse().map((h, i) => (
              <li key={i}>{label(h.from)} → {label(h.to)} · {h.by} · {new Date(h.at).toLocaleString("en-IN")}{h.note ? ` · "${h.note}"` : ""}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
