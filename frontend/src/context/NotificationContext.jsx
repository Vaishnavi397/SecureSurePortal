import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { io } from "socket.io-client";
import { useAuth } from "./AuthContext.jsx";

const NotificationContext = createContext(null);
export const useNotifications = () => useContext(NotificationContext);

// Opens one authenticated Socket.io connection while logged in and exposes the events.
export function NotificationProvider({ children }) {
  const { token } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [lastEvent, setLastEvent] = useState(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!token) return;
    const socket = io(import.meta.env.VITE_API_URL || window.location.origin, { auth: { token } });
    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    socket.on("claimStatusUpdated", (evt) => {
      const n = { ...evt, key: `${evt.claimId}-${evt.at}` };
      setLastEvent(n);
      setNotifications((prev) => [n, ...prev].slice(0, 5));
      setTimeout(() => setNotifications((prev) => prev.filter((x) => x.key !== n.key)), 10000);
    });
    return () => socket.close();
  }, [token]);

  const dismiss = useCallback((key) => setNotifications((prev) => prev.filter((n) => n.key !== key)), []);
  return <NotificationContext.Provider value={{ notifications, lastEvent, connected, dismiss }}>{children}</NotificationContext.Provider>;
}
