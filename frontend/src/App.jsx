import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";
import { Loader2 } from "lucide-react";

import AppShell      from "./components/layout/AppShell";
import LoginPage     from "./pages/LoginPage";
import HealthPage    from "./pages/HealthPage";
import HomePage      from "./pages/HomePage";
import UserPage      from "./pages/UserPage";
import ComputerPage  from "./pages/ComputerPage";
import DocusnapPage  from "./pages/DocusnapPage";
import AuditPage     from "./pages/AuditPage";
import TopDeskPage 	 from "./pages/TopDeskPage";
import ReportPage    from "./pages/ReportPage";
import AdminPage     from "./pages/AdminPage";

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--brand)" }} />
    </div>
  );

  if (!user) return <Navigate to="/login" replace />;
  return children;
}

// Zusätzliche Absicherung auf Routen-Ebene: Der Nav-Link ist zwar schon
// ausgeblendet (siehe AppShell.jsx), aber ein direkter Aufruf der URL soll
// nicht zu einer leeren/kaputten Seite führen. Die eigentliche Durchsetzung
// bleibt beim Backend (requirePermission("rbac:manage") in adminConfig.js) —
// das hier ist nur UX, kein Sicherheitsmechanismus.
function RequirePermission({ perm, children }) {
  const { hasPermission } = useAuth();
  if (!hasPermission(perm)) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route path="/" element={
        <ProtectedRoute>
          <AppShell />
        </ProtectedRoute>
      }>
        <Route index                    element={<HealthPage />} />
        <Route path="users"             element={<HomePage />} />
        <Route path="user/:sam"         element={<UserPage />} />
        <Route path="computer"          element={<ComputerPage />} />
        <Route path="computer/:name"    element={<ComputerPage />} />
        <Route path="docusnap"          element={<DocusnapPage />} />
        <Route path="docusnap/:hostname" element={<DocusnapPage />} />
        <Route path="audit"             element={<AuditPage />} />
        <Route path="topdesk"           element={<TopDeskPage />} />
        <Route path="report"            element={<ReportPage />} />
        <Route path="admin"             element={<RequirePermission perm="rbac:manage"><AdminPage /></RequirePermission>} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
