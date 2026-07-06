import { useState } from "react";
import { login } from "../api.js";

export default function Login({ onLoggedIn }) {
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(user, pass);
      onLoggedIn();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-screen">
      <form className="login-form" onSubmit={handleSubmit}>
        <h1>Ordenador de colecciones</h1>
        <label>
          Usuario
          <input value={user} onChange={(e) => setUser(e.target.value)} autoFocus required />
        </label>
        <label>
          Clave
          <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} required />
        </label>
        {error && <p className="error-text">{error}</p>}
        <button type="submit" disabled={loading}>
          {loading ? "Ingresando..." : "Ingresar"}
        </button>
      </form>
    </div>
  );
}
