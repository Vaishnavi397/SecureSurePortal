import { useState } from "react";
import { uploadDocument, getDocumentUrl, errMsg } from "../services/api.js";
import { DOC_TYPES, dateTime, label } from "../utils/format.js";

export default function DocumentPanel({ claim, onUpdated }) {
  const [file, setFile] = useState(null);
  const [docType, setDocType] = useState("POLICY_COPY");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  async function upload() {
    setBusy(true); setError(""); setOk("");
    try {
      onUpdated(await uploadDocument(claim.id, file, docType));
      setOk("Document uploaded to S3.");
      setFile(null);
      document.getElementById("file-input").value = "";
    } catch (e) { setError(errMsg(e)); } finally { setBusy(false); }
  }
  async function view(doc) {
    try { window.open(await getDocumentUrl(claim.id, doc._id), "_blank", "noopener"); } catch (e) { setError(errMsg(e)); }
  }
  return (
    <div className="card">
      <h3>Supporting Documents</h3>
      {claim.supportingDocuments.length === 0 ? <p className="muted">No documents uploaded yet.</p> : (
        <table className="table">
          <thead><tr><th>Type</th><th>File</th><th>Uploaded</th><th /></tr></thead>
          <tbody>
            {claim.supportingDocuments.map((d) => (
              <tr key={d._id}>
                <td>{label(d.docType)}</td><td>{d.originalName}</td><td>{dateTime(d.uploadedAt)}</td>
                <td>{d.s3Key ? <button className="btn small" onClick={() => view(d)}>View</button> : <span className="muted small-text">seed record</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="row upload">
        <select value={docType} onChange={(e) => setDocType(e.target.value)}>
          {DOC_TYPES.map((t) => <option key={t} value={t}>{label(t)}</option>)}
        </select>
        <input id="file-input" type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={(e) => setFile(e.target.files[0] || null)} />
        <button className="btn primary" disabled={!file || busy} onClick={upload}>{busy ? "Uploading..." : "Upload"}</button>
      </div>
      <p className="muted small-text">PDF, PNG or JPEG, max 5 MB.</p>
      {error && <div className="alert error">{error}</div>}
      {ok && <div className="alert success">{ok}</div>}
    </div>
  );
}
