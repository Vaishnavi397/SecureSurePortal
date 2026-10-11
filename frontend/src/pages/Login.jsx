import { useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { errMsg } from "../services/api.js";

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState("officer@securesure.com");
  const [password, setPassword] = useState("Officer@123");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try { await login(email, password); } catch (err) { setError(errMsg(err)); } finally { setBusy(false); }
  }
  return (
    <div className="login-wrap">
      <form className="card login" onSubmit={submit}>
        <h1>SecureSure Insurance</h1>
        <p className="muted">AI-Powered Claim Triage &amp; Assessment Dashboard</p>
        <label>Email<input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required /></label>
        <label>Password<input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required /></label>
        {error && <div className="alert error">{error}</div>}
        <button className="btn primary" disabled={busy}>{busy ? "Signing in..." : "Sign in"}</button>
        <p className="muted small-text">Demo: officer@securesure.com / Officer@123</p>
      </form>
    </div>
  );
}
