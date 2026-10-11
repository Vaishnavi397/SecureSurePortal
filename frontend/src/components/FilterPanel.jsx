import { CLAIM_TYPES, PRIORITIES, STATUSES, label } from "../utils/format.js";

export default function FilterPanel({ filters, onChange, onReset }) {
  const set = (k) => (e) => onChange({ ...filters, [k]: e.target.value });
  return (
    <div className="card filters">
      <input placeholder="Search claim no. or customer" value={filters.search} onChange={set("search")} />
      <select value={filters.claimType} onChange={set("claimType")}>
        <option value="">All types</option>
        {CLAIM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
      </select>
      <select value={filters.status} onChange={set("status")}>
        <option value="">All statuses</option>
        {STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
      </select>
      <select value={filters.priority} onChange={set("priority")}>
        <option value="">All priorities</option>
        {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
      </select>
      <button className="btn" onClick={onReset}>Reset</button>
    </div>
  );
}
