import { useNotifications } from "../context/NotificationContext.jsx";
import { label } from "../utils/format.js";

export default function NotificationPanel() {
  const { notifications, dismiss } = useNotifications();
  if (!notifications.length) return null;
  return (
    <div className="toasts" aria-live="polite">
      {notifications.map((n) => (
        <div className="toast" key={n.key}>
          <div>
            <strong>{n.claimNumber}</strong> status changed
            <div className="small-text">{label(n.from)} → <strong>{label(n.to)}</strong> by {n.updatedBy}</div>
          </div>
          <button className="x" onClick={() => dismiss(n.key)} aria-label="Dismiss">×</button>
        </div>
      ))}
    </div>
  );
}
