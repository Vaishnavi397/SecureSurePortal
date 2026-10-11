import { Routes, Route, Navigate, Link } from "react-router-dom";
import { useAuth } from "./context/AuthContext.jsx";
import { useNotifications } from "./context/NotificationContext.jsx";
import Login from "./pages/Login.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import ClaimPage from "./pages/ClaimPage.jsx";
import NotificationPanel from "./components/NotificationPanel.jsx";

function Protected({ children }) {
  const { token } = useAuth();
  return token ? children : <Navigate to="/login" replace />;
}

export default function App() {
  const { token, user, logout } = useAuth();
  const { connected } = useNotifications();
  return (
    <>
      {token && (
        <header className="topbar">
          <Link to="/" className="brand">SecureSure Claims</Link>
          <div className="topbar-right">
            <span className={`live ${connected ? "on" : ""}`} title="Real-time connection">{connected ? "● Live" : "○ Offline"}</span>
            <span>{user?.name} ({user?.role})</span>
            <button className="btn small" onClick={logout}>Logout</button>
          </div>
        </header>
      )}
      <NotificationPanel />
      <main className="container">
        <Routes>
          <Route path="/login" element={token ? <Navigate to="/" replace /> : <Login />} />
          <Route path="/" element={<Protected><Dashboard /></Protected>} />
          <Route path="/claims/:id" element={<Protected><ClaimPage /></Protected>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </>
  );
}
