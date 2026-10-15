import { createContext } from "react";

// Reine Context-Definition, keine Komponente, kein Hook — bewusst getrennt von
// AuthProvider.jsx und useAuth.js, um Vites React-Fast-Refresh-Einschränkung
// zu vermeiden: eine Datei, die eine Komponente UND eine "normale" Funktion
// exportiert, kann bei Hot-Reload einen losgelösten/veralteten Context liefern
// (Symptom: eingeloggte User verlieren Permissions in der UI, obwohl Backend
// und Session korrekt sind — siehe Vorfälle vom 14.07.2026).
export const AuthContext = createContext(null);
