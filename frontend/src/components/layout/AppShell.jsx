import { useState, useEffect } from "react";
import { Outlet, NavLink, useNavigate } from "react-router-dom";
import {
  Users, Monitor, ClipboardList,
  Search, Sun, Moon, LogOut, ChevronRight,
  Shield, TicketCheck, Database, Activity, FileBarChart, Settings,
} from "lucide-react";
import { useAuth }  from "../../hooks/useAuth";
import { useTheme } from "../../hooks/useTheme";
import { formatRoleLabel } from "../../utils/roleLabels";
import GlobalSearch from "../user/GlobalSearch";
import { topdesk }  from "../../api/client";

const NAV = [
  { to: "/",          icon: Activity,      label: "Status"    },
  { to: "/users",     icon: Users,         label: "Benutzer"  },
  { to: "/computer",  icon: Monitor,       label: "Computer"  },
  { to: "/docusnap",  icon: Database,      label: "Docusnap"  },
  { to: "/topdesk",   icon: TicketCheck,   label: "TopDesk"   },
  { to: "/report",    icon: FileBarChart,  label: "Report"    },
  { to: "/audit",     icon: ClipboardList, label: "Audit-Log" },
];

export default function AppShell() {
  const { user, logout, hasPermission } = useAuth();
  const { dark, toggle }          = useTheme();
  const [searching, setSearching] = useState(false);
  const [topdeskCount, setTopdeskCount] = useState(0);
  const navigate                  = useNavigate();

  const visibleNav = NAV; // Administration NICHT mehr Teil der regulären Funktions-Navigation
  const showAdmin  = hasPermission("rbac:manage");

  useEffect(() => {
    const fetchCount = async () => {
      try {
        const r = await topdesk.count();
        setTopdeskCount(r.count || 0);
      } catch {}
    };
    fetchCount();
    const interval = setInterval(fetchCount, 60_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex h-screen overflow-hidden"
         style={{ backgroundColor: "var(--bg-secondary)" }}>

      {/* ── Sidebar ──────────────────────────────────────────────────────── */}
      <aside className="w-56 flex flex-col border-r shrink-0"
             style={{ backgroundColor: "var(--bg-primary)", borderColor: "var(--border)" }}>

        {/* Logo */}
        <div className="h-14 flex items-center gap-3 px-4 border-b"
             style={{ borderColor: "var(--border)" }}>
          <div className="w-7 h-7 rounded-lg flex items-center justify-center"
               style={{ backgroundColor: "var(--brand)" }}>
            <Shield className="w-4 h-4 text-white" />
          </div>
          <span className="font-semibold text-sm tracking-tight"
                style={{ color: "var(--text-primary)" }}>
            ConnOps
          </span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-2 space-y-0.5">
          {visibleNav.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
                  isActive ? "active-nav" : "inactive-nav"
                }`
              }
              style={({ isActive }) => ({
                backgroundColor: isActive ? "var(--brand-light)" : "transparent",
                color:           isActive ? "var(--brand)"       : "var(--text-secondary)",
              })}
            >
              {({ isActive }) => (
                <>
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="flex-1">{label}</span>
                  {to === "/topdesk" && topdeskCount > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full text-xs font-semibold"
                          style={{ backgroundColor: "var(--danger)", color: "#fff" }}>
                      {topdeskCount}
                    </span>
                  )}
                  {isActive && !(to === "/topdesk" && topdeskCount > 0) && (
                    <ChevronRight className="w-3 h-3 opacity-50" />
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Administration – bewusst getrennt von der Funktions-Navigation
            oben (Status/Benutzer/Computer/...): das dort ist "was man mit
            dem Programm tun kann", das hier ist "wie das Programm
            eingestellt ist". Nur sichtbar mit rbac:manage. */}
        {showAdmin && (
          <div className="p-2 border-t" style={{ borderColor: "var(--border)" }}>
            <NavLink
              to="/admin"
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
                  isActive ? "active-nav" : "inactive-nav"
                }`
              }
              style={({ isActive }) => ({
                backgroundColor: isActive ? "var(--brand-light)" : "transparent",
                color:           isActive ? "var(--brand)"       : "var(--text-secondary)",
              })}
            >
              <Settings className="w-4 h-4 shrink-0" />
              <span className="flex-1">Einstellungen</span>
            </NavLink>
          </div>
        )}

        {/* User-Info */}
        <div className="p-2 border-t" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg"
               style={{ backgroundColor: "var(--bg-subtle)" }}>
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold text-white shrink-0"
                 style={{ backgroundColor: "var(--brand)" }}>
              {user?.samAccountName?.[0]?.toUpperCase() || "?"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate" style={{ color: "var(--text-primary)" }}>
                {user?.displayName || user?.samAccountName}
              </p>
              <p className="text-xs truncate" style={{ color: "var(--text-muted)" }}>
                {formatRoleLabel(user?.role)}
              </p>
            </div>
          </div>
        </div>
      </aside>

      {/* ── Hauptbereich ─────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Topbar */}
        <header className="h-14 flex items-center gap-3 px-4 border-b shrink-0"
                style={{ backgroundColor: "var(--bg-primary)", borderColor: "var(--border)" }}>

          <div className="flex-1 max-w-xl">
            <button
              data-search-trigger
              onClick={() => setSearching(true)}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors border"
              style={{
                backgroundColor: "var(--bg-subtle)",
                borderColor:     "var(--border)",
                color:           "var(--text-muted)",
              }}>
              <Search className="w-4 h-4 shrink-0" />
              <span>Benutzer oder Computer suchen…</span>
              <kbd className="ml-auto text-xs px-1.5 py-0.5 rounded border font-mono"
                   style={{ borderColor: "var(--border-strong)", color: "var(--text-muted)" }}>
                /
              </kbd>
            </button>
          </div>

          <div className="flex items-center gap-1">
            <button onClick={toggle}
              className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
              style={{ color: "var(--text-muted)" }}
              title={dark ? "Light Mode" : "Dark Mode"}>
              {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button onClick={logout}
              className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
              style={{ color: "var(--text-muted)" }}
              title="Abmelden">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>

      {/* Globale Suche Modal */}
      {searching && (
        <GlobalSearch
          onClose={() => setSearching(false)}
          onSelect={(type, id) => {
            setSearching(false);
            if (type === "computer") navigate(`/computer/${id}`);
            else navigate(`/user/${id}`);
          }}
        />
      )}
    </div>
  );
}