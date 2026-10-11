import { money, date, label } from "../utils/format.js";

export const StatusBadge = ({ status }) => <span className={`badge st-${status}`}>{label(status)}</span>;

export default function ClaimCard({ claim, onOpen }) {
  return (
    <div className="claim-row card-row" onClick={onOpen} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && onOpen()}>
      <span className="strong">{claim.claimNumber}</span>
      <span>{claim.claimType}</span>
      <span>{claim.customerName}</span>
      <span>{money(claim.claimedAmount)}</span>
      <span><span className={`badge pr-${claim.priority}`}>{claim.priority}</span></span>
      <span><StatusBadge status={claim.status} /></span>
      <span>{date(claim.incidentDate)}</span>
      <span>{date(claim.updatedAt)}</span>
    </div>
  );
}
