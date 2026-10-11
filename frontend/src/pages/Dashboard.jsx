import { useEffect, useMemo, useState } from "react";
import { getClaims, errMsg } from "../services/api.js";
import { useNotifications } from "../context/NotificationContext.jsx";
import FilterPanel from "../components/FilterPanel.jsx";
import ClaimList from "../components/ClaimList.jsx";
import { STATUSES, label } from "../utils/format.js";

const emptyFilters = { search: "", claimType: "", status: "", priority: "" };

export default function Dashboard() {
  const [filters, setFilters] = useState(emptyFilters);
  const [claims, setClaims] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { lastEvent } = useNotifications();

  // Server-side filtering (debounced for the search box).
  useEffect(() => {
    const t = setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
        setClaims((await getClaims(params)).claims);
      } catch (e) { setError(errMsg(e)); } finally { setLoading(false); }
    }, 250);
    return () => clearTimeout(t);
  }, [filters]);

  // Real-time: patch the status in the list when another user changes a claim.
  useEffect(() => {
    if (!lastEvent) return;
    setClaims((prev) => prev.map((c) => (c.id === lastEvent.claimId ? { ...c, status: lastEvent.to, updatedAt: lastEvent.at } : c)));
  }, [lastEvent]);

  const counts = useMemo(() => Object.fromEntries(STATUSES.map((s) => [s, claims.filter((c) => c.status === s).length])), [claims]);

  return (
    <>
      <h2>Claims Dashboard</h2>
      <div className="stats">
        <div className="stat"><strong>{claims.length}</strong><span>Shown</span></div>
        {["NEW", "UNDER_REVIEW", "ADDITIONAL_INFO_REQUIRED", "APPROVED"].map((s) => (
          <div className="stat" key={s}><strong>{counts[s]}</strong><span>{label(s)}</span></div>
        ))}
      </div>
      <FilterPanel filters={filters} onChange={setFilters} onReset={() => setFilters(emptyFilters)} />
      {error && <div className="alert error">{error}</div>}
      {loading ? <p className="muted">Loading claims...</p> : <ClaimList claims={claims} />}
    </>
  );
}
