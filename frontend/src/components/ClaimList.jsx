import { useNavigate } from "react-router-dom";
import ClaimCard from "./ClaimCard.jsx";

export default function ClaimList({ claims }) {
  const navigate = useNavigate();
  if (!claims.length) return <div className="card muted">No claims match the current filters.</div>;
  return (
    <div className="claim-list">
      <div className="claim-row header">
        <span>Claim</span><span>Type</span><span>Customer</span><span>Amount</span><span>Priority</span><span>Status</span><span>Incident</span><span>Updated</span>
      </div>
      {claims.map((c) => <ClaimCard key={c.id} claim={c} onOpen={() => navigate(`/claims/${c.id}`)} />)}
    </div>
  );
}
