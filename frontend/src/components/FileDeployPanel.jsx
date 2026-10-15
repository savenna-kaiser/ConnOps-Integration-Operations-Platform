import { useState, useEffect, useCallback } from "react";
import {
  Send, Folder, FolderOpen, File as FileIcon, Plus, ChevronRight, ChevronDown,
  Loader2, CheckCircle, XCircle, AlertCircle,
} from "lucide-react";
import { computers } from "../api/client";
import ConfirmDialog from "./ConfirmDialog";

// FileDeploy-Bereich der Computer-Detailseite.
// Quelle: UNC-Pfad (wird vom Server mit den Zugangsdaten des angemeldeten
// Benutzers gelesen). Ziel: Ordner auf dem Computer, per Ordnerbaum waehlbar
// oder direkt eingetippt. Vorbelegung: C:\install.

const DEFAULT_DEST = "C:\\install";
const LS_DEST   = "connops.filedeploy.dest";
const LS_SRCROOT = "connops.filedeploy.sourceRoot";

function lsGet(key, fallback) {
  try { return localStorage.getItem(key) || fallback; } catch { return fallback; }
}
function lsSet(key, value) {
  try { localStorage.setItem(key, value); } catch { /* optional */ }
}

// Reihenfolge der Schritte in der Ergebnisanzeige
const STEP_ORDER = ["source", "reachability", "adminShare", "targetDirectory", "copy"];

// ─── Baum (Ordner, optional mit Dateien) ─────────────────────────────────────
function fmtSize(bytes) {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
const asArray = (x) => (Array.isArray(x) ? x : x ? [x] : []);

// list(path) -> Promise<{ folders: [{name,path}], files?: [{name,path,size}], truncated? }>
function TreeNode({ label, path, depth, list, selected, onSelect, onPick }) {
  const [open, setOpen] = useState(depth === 0);
  const [state, setState] = useState({ loaded: false, loading: false, error: null, folders: [], files: [], truncated: false });

  const load = useCallback(async () => {
    setState(s => ({ ...s, loading: true, error: null }));
    try {
      const data = await list(path);
      setState({
        loaded: true, loading: false, error: null,
        folders: asArray(data.folders), files: asArray(data.files), truncated: !!data.truncated,
      });
    } catch (err) {
      setState({ loaded: true, loading: false, error: err.message || "Nicht lesbar", folders: [], files: [], truncated: false });
    }
  }, [list, path]);

  useEffect(() => {
    if (open && !state.loaded && !state.loading) load();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const isSel = selected === path;
  const pad = (d) => d * 16 + 4;

  return (
    <div>
      <div className="flex items-center gap-1 rounded px-1 py-0.5"
           style={{ paddingLeft: pad(depth), backgroundColor: isSel ? "var(--bg-subtle)" : "transparent" }}>
        <button type="button" onClick={() => setOpen(o => !o)}
                className="w-4 h-4 flex items-center justify-center shrink-0"
                aria-label={open ? "Zuklappen" : "Aufklappen"}>
          {open
            ? <ChevronDown className="w-3.5 h-3.5" style={{ color: "var(--text-muted)" }} />
            : <ChevronRight className="w-3.5 h-3.5" style={{ color: "var(--text-muted)" }} />}
        </button>
        <button type="button" onClick={() => onSelect(path, false)}
                onDoubleClick={() => setOpen(o => !o)}
                className="flex items-center gap-1.5 text-sm text-left flex-1 min-w-0">
          {open
            ? <FolderOpen className="w-4 h-4 shrink-0" style={{ color: "var(--brand)" }} />
            : <Folder className="w-4 h-4 shrink-0" style={{ color: "var(--brand)" }} />}
          <span className="truncate" style={{ color: "var(--text-primary)", fontWeight: isSel ? 600 : 400 }}>
            {label}
          </span>
        </button>
      </div>

      {open && state.loading && (
        <div className="flex items-center gap-2 text-xs py-1"
             style={{ paddingLeft: pad(depth + 1) + 20, color: "var(--text-muted)" }}>
          <Loader2 className="w-3 h-3 animate-spin" /> Lade…
        </div>
      )}
      {open && state.error && (
        <div className="text-xs py-1" style={{ paddingLeft: pad(depth + 1) + 20, color: "var(--text-muted)" }}
             title={state.error}>
          (nicht lesbar: {state.error.length > 80 ? state.error.slice(0, 80) + "…" : state.error})
        </div>
      )}
      {open && state.folders.map(c => (
        <TreeNode key={c.path} label={c.name} path={c.path} depth={depth + 1}
                  list={list} selected={selected} onSelect={onSelect} onPick={onPick} />
      ))}
      {open && state.files.map(f => {
        const sel = selected === f.path;
        return (
          <div key={f.path} className="flex items-center gap-1 rounded px-1 py-0.5"
               style={{ paddingLeft: pad(depth + 1) + 20, backgroundColor: sel ? "var(--bg-subtle)" : "transparent" }}>
            <button type="button" onClick={() => onSelect(f.path, true)}
                    onDoubleClick={() => onPick && onPick(f.path)}
                    className="flex items-center gap-1.5 text-sm text-left flex-1 min-w-0">
              <FileIcon className="w-4 h-4 shrink-0" style={{ color: "var(--text-muted)" }} />
              <span className="truncate" style={{ color: "var(--text-primary)", fontWeight: sel ? 600 : 400 }}>
                {f.name}
              </span>
              <span className="text-xs ml-auto shrink-0" style={{ color: "var(--text-muted)" }}>
                {fmtSize(f.size)}
              </span>
            </button>
          </div>
        );
      })}
      {open && state.truncated && (
        <div className="text-xs py-1" style={{ paddingLeft: pad(depth + 1) + 20, color: "var(--text-muted)" }}>
          (Anzeige auf 2000 Einträge begrenzt)
        </div>
      )}
    </div>
  );
}

function DialogShell({ title, children, onCancel, onApply, applyDisabled }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ backgroundColor: "rgba(0,0,0,0.4)" }}>
      <div className="card p-5 w-full max-w-lg flex flex-col" style={{ maxHeight: "80vh" }}>
        <h3 className="text-base font-semibold mb-1" style={{ color: "var(--text-primary)" }}>{title}</h3>
        {children}
        <div className="flex justify-end gap-2 mt-3">
          <button type="button" className="btn-secondary text-sm" onClick={onCancel}>Abbrechen</button>
          <button type="button" className="btn-primary text-sm disabled:opacity-40"
                  disabled={applyDisabled} onClick={onApply}>
            Übernehmen
          </button>
        </div>
      </div>
    </div>
  );
}

// Zielordner auf dem Computer waehlen (nur Ordner)
function FolderDialog({ computer, initial, onApply, onCancel }) {
  const [selected, setSelected] = useState(null);
  const list = useCallback((p) => computers.fileDeployFolders(computer, p), [computer]);
  return (
    <DialogShell title="Zielordner auswählen" onCancel={onCancel}
                 applyDisabled={!selected} onApply={() => onApply(selected)}>
      <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
        {computer} – es gelten die Rechte Ihres Administratorkontos. Verborgene Ordner werden nicht angezeigt;
        andere Laufwerke oder verborgene Ordner können Sie im Feld direkt eintippen.
      </p>
      <div className="flex-1 overflow-auto rounded border p-2"
           style={{ borderColor: "var(--border)", minHeight: 240 }}>
        <TreeNode label="C:\" path="C:\" depth={0} list={list}
                  selected={selected} onSelect={(p) => setSelected(p)} />
      </div>
      <p className="text-xs mt-3" style={{ color: "var(--text-muted)" }}>
        Ausgewählt:{" "}
        <span className="font-mono" style={{ color: "var(--text-primary)" }}>{selected || initial || "–"}</span>
      </p>
    </DialogShell>
  );
}

// Quelldatei waehlen: Startordner (UNC) eingeben, dann Baum mit Ordnern und Dateien
function SourceDialog({ initialRoot, onApply, onCancel }) {
  const [rootInput, setRootInput] = useState(initialRoot || "");
  const [root, setRoot]           = useState(initialRoot || "");
  const [selected, setSelected]   = useState(null);   // gewaehlte Datei
  const rootOk = /^\\\\[^\\/:*?"<>|]+\\[^\\/:*?"<>|]+(\\[^\\/:*?"<>|]+)*$/.test(rootInput.trim());
  const list = useCallback((p) => computers.fileDeploySource(p), []);

  const load = (e) => {
    e?.preventDefault();
    if (!rootOk) return;
    setSelected(null);
    setRoot(rootInput.trim().replace(/\\+$/, ""));
  };

  return (
    <DialogShell title="Quelldatei auswählen" onCancel={onCancel}
                 applyDisabled={!selected} onApply={() => onApply(selected, root)}>
      <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
        Startordner als UNC-Pfad eingeben (z. B. \\server\freigabe oder \\server\C$\install), dann
        die Datei im Baum auswählen. Es gelten die Rechte Ihres Administratorkontos.
      </p>
      <form onSubmit={load} className="flex gap-2 mb-3">
        <input className="input flex-1 font-mono text-sm" placeholder="\\server\freigabe"
               value={rootInput} onChange={e => setRootInput(e.target.value)} autoFocus />
        <button type="submit" className="btn-secondary text-sm disabled:opacity-40" disabled={!rootOk}>Laden</button>
      </form>
      <div className="flex-1 overflow-auto rounded border p-2"
           style={{ borderColor: "var(--border)", minHeight: 240 }}>
        {root
          ? <TreeNode key={root} label={root} path={root} depth={0} list={list}
                      selected={selected}
                      onSelect={(p, isFile) => setSelected(isFile ? p : null)}
                      onPick={(p) => onApply(p, root)} />
          : <p className="text-xs p-2" style={{ color: "var(--text-muted)" }}>Noch kein Startordner geladen.</p>}
      </div>
      <p className="text-xs mt-3 break-all" style={{ color: "var(--text-muted)" }}>
        Ausgewählt:{" "}
        <span className="font-mono" style={{ color: "var(--text-primary)" }}>{selected || "–"}</span>
      </p>
    </DialogShell>
  );
}

// ─── Ergebnisanzeige ─────────────────────────────────────────────────────────
function ResultView({ result }) {
  const ok = result.overall === "Success";
  return (
    <div className="mt-4 rounded-lg border p-3" style={{ borderColor: "var(--border)" }}>
      <div className="flex items-center gap-2 text-sm font-medium mb-2"
           style={{ color: ok ? "#15803d" : "var(--danger)" }}>
        {ok ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
        {ok
          ? `${result.fileName} wurde nach ${result.targetDir} kopiert.`
          : (result.errorMessage || "Kopiervorgang fehlgeschlagen.")}
      </div>
      <ul className="space-y-1">
        {STEP_ORDER.filter(k => result.steps?.[k]).map(k => {
          const st = result.steps[k];
          const good = st.state === "Ok";
          return (
            <li key={k} className="text-sm">
              <div className="flex items-center gap-2"
                   style={{ color: good ? "#15803d" : "var(--danger)" }}>
                {good ? <CheckCircle className="w-3.5 h-3.5 shrink-0" /> : <XCircle className="w-3.5 h-3.5 shrink-0" />}
                {st.text}
              </div>
              {!good && st.detail && (
                <p className="text-xs ml-6 mt-0.5 break-words" style={{ color: "var(--text-muted)" }}>
                  {st.detail}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      {ok && result.sha256 && (
        <p className="text-xs mt-2 font-mono break-all" style={{ color: "var(--text-muted)" }}>
          SHA-256: {result.sha256}
        </p>
      )}
    </div>
  );
}

// ─── Panel ───────────────────────────────────────────────────────────────────
export default function FileDeployPanel({ name }) {
  const [source, setSource]   = useState("");
  const [dest, setDest]       = useState(() => lsGet(LS_DEST, DEFAULT_DEST));
  const [showTree, setShowTree] = useState(false);
  const [showSource, setShowSource] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult]   = useState(null);
  const [error, setError]     = useState(null);

  const sourceOk = /^\\\\[^\\/:*?"<>|]+\\[^\\/:*?"<>|]+(\\[^\\/:*?"<>|]+)+$/.test(source.trim());
  const destOk   = /^[A-Za-z]:\\([^\\/:*?"<>|]+\\)*[^\\/:*?"<>|]*$/.test(dest.trim());
  const canStart = sourceOk && destOk && !running;
  const fileName = source.trim().split("\\").pop();

  // Startordner fuer den Quell-Dialog: Ordner der aktuellen Quelle, sonst zuletzt genutzter Startordner
  const startRoot = sourceOk
    ? source.trim().slice(0, source.trim().lastIndexOf("\\"))
    : lsGet(LS_SRCROOT, "");

  const start = async () => {
    setConfirm(false);
    setRunning(true); setResult(null); setError(null);
    lsSet(LS_SRCROOT, source.trim().slice(0, source.trim().lastIndexOf("\\")));
    lsSet(LS_DEST, dest.trim());
    try {
      const data = await computers.fileDeploy(name, source.trim(), dest.trim());
      setResult(data.result);
    } catch (err) {
      setError(err.message || "Kopiervorgang fehlgeschlagen.");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 mb-1">
        <Send className="w-4 h-4" style={{ color: "var(--brand)" }} />
        <h2 className="text-sm font-semibold" style={{ color: "var(--text-secondary)" }}>
          Datei verteilen (FileDeploy)
        </h2>
      </div>
      <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
        Kopiert eine Datei mit Ihrem Administratorkonto auf {name}. Die Aktion wird im Audit-Log protokolliert.
      </p>

      <label className="text-xs block mb-1" style={{ color: "var(--text-muted)" }}>
        Quelldatei (UNC-Pfad)
      </label>
      <div className="flex gap-2 mb-1">
        <input className="input flex-1 font-mono text-sm"
               placeholder="\\server\freigabe\ordner\datei.msi"
               value={source} disabled={running}
               onChange={e => setSource(e.target.value)} />
        <button type="button" className="btn-secondary text-sm" disabled={running}
                onClick={() => setShowSource(true)}>
          <Plus className="w-4 h-4" /> Auswählen…
        </button>
      </div>
      {source && !sourceOk && (
        <p className="text-xs mb-2" style={{ color: "var(--danger)" }}>
          Erwartet wird ein UNC-Pfad auf eine Datei, z. B. \\server\freigabe\datei.msi
        </p>
      )}

      <label className="text-xs block mb-1 mt-2" style={{ color: "var(--text-muted)" }}>
        Zielordner auf {name}
      </label>
      <div className="flex gap-2 mb-1">
        <input className="input flex-1 font-mono text-sm"
               value={dest} disabled={running}
               onChange={e => setDest(e.target.value)} />
        <button type="button" className="btn-secondary text-sm" disabled={running}
                onClick={() => setShowTree(true)}>
          <Plus className="w-4 h-4" /> Auswählen…
        </button>
      </div>
      {dest && !destOk && (
        <p className="text-xs mb-2" style={{ color: "var(--danger)" }}>
          Erwartet wird ein Pfad mit Laufwerksbuchstaben, z. B. C:\install
        </p>
      )}
      <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
        Existiert der Zielordner nicht, wird er angelegt. Eine gleichnamige Datei wird überschrieben.
      </p>

      <button type="button" className="btn-primary text-sm disabled:opacity-40"
              disabled={!canStart} onClick={() => setConfirm(true)}>
        {running
          ? <><Loader2 className="w-4 h-4 animate-spin" /> Kopiere…</>
          : <><Send className="w-4 h-4" /> Datei kopieren</>}
      </button>

      {error && (
        <div className="mt-3 rounded-lg px-3 py-2 text-sm flex items-center gap-2"
             style={{ backgroundColor: "var(--danger-light)", color: "var(--danger)" }}>
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}
      {result && <ResultView result={result} />}

      {showSource && (
        <SourceDialog initialRoot={startRoot}
                      onCancel={() => setShowSource(false)}
                      onApply={(file, root) => { setSource(file); lsSet(LS_SRCROOT, root); setShowSource(false); }} />
      )}

      {showTree && (
        <FolderDialog computer={name} initial={dest}
                      onCancel={() => setShowTree(false)}
                      onApply={(p) => { setDest(p); setShowTree(false); }} />
      )}

      {confirm && (
        <ConfirmDialog
          title="Datei kopieren?"
          message={`„${fileName}" wird nach ${dest.trim()} auf ${name} kopiert. Eine vorhandene gleichnamige Datei wird überschrieben.`}
          confirmLabel="Kopieren"
          danger={false}
          loading={running}
          onConfirm={start}
          onCancel={() => setConfirm(false)}
        />
      )}
    </div>
  );
}
