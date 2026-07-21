import { useState, useEffect } from "react";
import { User, Loader2, X } from "lucide-react";
import { users } from "../../api/client";

/**
 * AdUserSearchField – Debounced AD-Benutzersuche mit Auswahl-Dropdown.
 *
 * Verhindert uneinheitliche Freitext-Eingaben (z.B. "Kaiser" vs. "Savenna
 * Kaiser" vs. "S. Kaiser" für dieselbe Person) — nutzt stattdessen dieselbe
 * AD-Suche wie die "Mitarbeiter"-Auswahl.
 *
 * Liefert bei Auswahl den DisplayName als String (onChange), nicht das
 * vollständige AD-Objekt — passend zum bestehenden "ausgehaendigtVon"-Feld,
 * das im Backend/PDF nur als Textfeld verwendet wird (siehe
 * handoverService.js), kein Schema-Wechsel nötig.
 */
export default function AdUserSearchField({ label, placeholder, value, onChange }) {
  const [search,   setSearch]   = useState("");
  const [results,  setResults]  = useState([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (search.length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await users.search(search);
        setResults((res.results || []).slice(0, 8));
      } catch { setResults([]); }
      finally { setSearching(false); }
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  if (value) {
    return (
      <div>
        {label && (
          <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
            {label}
          </label>
        )}
        <div className="flex items-center justify-between px-3 py-2.5 rounded-xl"
             style={{ backgroundColor: "var(--bg-subtle)", border: "1px solid var(--border)" }}>
          <div className="flex items-center gap-2 min-w-0">
            <User className="w-4 h-4 shrink-0" style={{ color: "var(--brand)" }} />
            <span className="text-sm truncate" style={{ color: "var(--text-primary)" }}>{value}</span>
          </div>
          <button onClick={() => { onChange(""); setSearch(""); }} style={{ color: "var(--text-muted)" }}>
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {label && (
        <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
          {label}
        </label>
      )}
      <div className="relative">
        <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
              style={{ color: "var(--text-muted)" }} />
        <input
          className="input pl-10 w-full"
          placeholder={placeholder || "Name oder SAM-Account…"}
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {searching && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin"
                   style={{ color: "var(--text-muted)" }} />
        )}
      </div>

      {results.length > 0 && (
        <div className="mt-1 rounded-xl border overflow-hidden"
             style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-primary)" }}>
          {results.map(u => (
            <button
              key={u.SamAccountName}
              onClick={() => { onChange(u.DisplayName || u.SamAccountName); setSearch(""); setResults([]); }}
              className="w-full text-left flex items-center gap-3 px-3 py-2.5 transition-colors"
              style={{ borderBottom: "1px solid var(--border)" }}>
              <User className="w-4 h-4 shrink-0" style={{ color: "var(--text-muted)" }} />
              <div className="min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>
                  {u.DisplayName || u.SamAccountName}
                </p>
                <p className="text-xs font-mono truncate" style={{ color: "var(--text-muted)" }}>
                  {u.SamAccountName}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
