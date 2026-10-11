import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getClaim, errMsg } from "../services/api.js";
import { useNotifications } from "../context/NotificationContext.jsx";
import { StatusBadge } from "../components/ClaimCard.jsx";
import StatusControl from "../components/StatusControl.jsx";
import DocumentPanel from "../components/DocumentPanel.jsx";
import PolicyPanel from "../components/PolicyPanel.jsx";
import AssessmentPanel from "../components/AssessmentPanel.jsx";
import { money, date, dateTime } from "../utils/format.js";

export default function ClaimPage() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const { lastEvent } = useNotifications();

  const load = useCallback(async () => {
    try { setData(await getClaim(id)); setError(""); } catch (e) { setError(errMsg(e)); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  // Real-time: refresh this page if somebody else changed this claim's status.
  useEffect(() => { if (lastEvent && lastEvent.claimId === id) load(); }, [lastEvent, id, load]);

  if (error) return <><Link to="/">← Back</Link><div className="alert error">{error}</div></>;
  if (!data) return <p className="muted">Loading claim...</p>;

  const { claim, allowedTransitions } = data;
  const merge = (next) => setData((prev) => ({ ...prev, ...(next.claim ? { claim: next.claim } : { claim: next }), ...(next.allowedTransitions ? { allowedTransitions: next.allowedTransitions } : {}) }));

  return (
    <>
      <Link to="/">← Back to dashboard</Link>
      <div className="card">
        <div className="row between">
          <h2>{claim.claimNumber} · {claim.claimType}</h2>
          <StatusBadge status={claim.status} />
        </div>
        <div className="grid">
          <div><span className="muted">Customer</span><div>{claim.customerName}</div></div>
          <div><span className="muted">Policy number</span><div>{claim.policyNumber}</div></div>
          <div><span className="muted">Claimed amount</span><div>{money(claim.claimedAmount)}</div></div>
          <div><span className="muted">Priority</span><div>{claim.priority}</div></div>
          <div><span className="muted">Incident date</span><div>{date(claim.incidentDate)}</div></div>
          <div><span className="muted">Created / updated</span><div>{dateTime(claim.createdAt)} / {dateTime(claim.updatedAt)}</div></div>
        </div>
        <p><span className="muted">Incident description</span><br />{claim.incidentDescription}</p>
      </div>
      <StatusControl claim={claim} allowed={allowedTransitions} onUpdated={merge} />
      <DocumentPanel claim={claim} onUpdated={merge} />
      <PolicyPanel claim={claim} />
      <AssessmentPanel claim={claim} onUpdated={merge} />
    </>
  );
}
