import { useState, useEffect, useCallback } from "react";
import { AuthContext } from "./AuthContext";
import { auth } from "../api/client";

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Direkt fetch statt über client.js um den 401-Redirect zu umgehen
    fetch("/api/auth/me", { credentials: "include" })
      .then(res => res.ok ? res.json() : null)
      .then(data => setUser(data?.user || null))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const login = async (username, password) => {
    const data = await auth.login(username, password);
    setUser(data.user);
    return data;
  };

  const logout = async () => {
    await auth.logout();
    setUser(null);
    window.location.href = "/login";
  };

  // Zentraler Permission-Check gegen die vom Backend gelieferte Liste
  // (req.session.user.permissions, siehe routes/auth.js /me). Ersetzt lokale
  // hasPermission()-Kopien in einzelnen Seiten (Phase 6.2) — eine Quelle der
  // Wahrheit statt mehrerer, potenziell veralteter Duplikate.
  const hasPermission = useCallback(
    (permission) => Boolean(user?.permissions?.includes(permission)),
    [user]
  );

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
}
