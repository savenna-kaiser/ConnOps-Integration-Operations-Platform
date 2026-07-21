// Interne Rollennamen (it-lead, it-admin, helpdesk) sind stabile Bezeichner,
// die in rbac.js/Permission-Vergleichen/Session/DB verwendet werden — NICHT
// umbenennen. Diese Datei ordnet ihnen nur ein huebsches Anzeige-Label zu,
// rein fuers UI (Sidebar, Rollen-Tab).
const ROLE_LABELS = {
  "it-lead":  "IT-Lead",
  "it-admin": "IT-Admin",
  "helpdesk": "Helpdesk",
};

export function formatRoleLabel(roleName) {
  return ROLE_LABELS[roleName] || roleName;
}
