/**
 * auth.js – Login / Logout Routen
 * Pfade angepasst an tatsächliche Projektstruktur:
 *   adLogin liegt in actions/auth/adLogin.js → ../actions/auth/adLogin
 *   credentialCrypto in services/            → ../services/credentialCrypto
 *
 * Phase 6.1: getRoleForUser() ist jetzt async (fragt ad_group_roles in
 * PostgreSQL ab) – der session.regenerate()-Callback ist daher ebenfalls
 * async geworden, damit awaitet werden kann.
 */

const express               = require("express");
const rateLimit              = require("express-rate-limit");
const { ACTION_TYPES }      = require("../services/auditLog");
const { requireAuth }       = require("../middleware/authMiddleware");
const { validate, schemas } = require("../middleware/validation");
const { encryptCredential } = require("../services/credentialCrypto");
const { getRoleForUser, getPermissionsForRole } = require("../middleware/rbac");
const adLogin               = require("../actions/auth/adLogin");

const router = express.Router();

// Security-Review 3.2 (16.07.2026): Brute-Force-Schutz auf /login.
// keyGenerator liest X-Forwarded-For manuell aus (wie auditMiddleware.js) -
// req.ip waere ohne "trust proxy" (bewusst nicht gesetzt, siehe rbac.js-
// Kommentare) hinter IIS/ARR immer 127.0.0.1, das Limit wuerde sich sonst
// alle Nutzer teilen statt pro Client zu greifen.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 Minuten
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) =>
    req.headers["x-forwarded-for"]?.split(",")[0].trim() ||
    req.socket?.remoteAddress || "unknown",
  // req.audit existiert bereits an dieser Stelle (auditMiddleware laeuft
  // global VOR dem Routen-Mounting, siehe server.js) - ohne diesen Handler
  // wuerde express-rate-limit die 429-Antwort senden, OHNE einen Audit-
  // Eintrag zu schreiben (Standardverhalten der Bibliothek). Faellt unter
  // die "fehler"-Kategorie im Audit-Log automatisch, da result:"failure"
  // (siehe getCategoryFilter() in auditLog.js - "fehler" ignoriert die
  // Aktionsliste bewusst, jede fehlgeschlagene Aktion gehoert dorthin).
  handler: (req, res) => {
    req.audit?.log({
      action:     "RATE_LIMIT_EXCEEDED",
      actor:      req.body?.username || "unknown",
      target:     req.body?.username || "unknown",
      targetType: "user",
      result:     "failure",
      details:    { route: "/api/auth/login" },
    });
    res.status(429).json({ error: "Zu viele Anmeldeversuche. Bitte in 15 Minuten erneut versuchen." });
  },
});

router.post("/login", loginLimiter, validate(schemas.login), async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await adLogin.execute({ username, password });

    // Rolle VOR dem regenerate() ermitteln – vermeidet verschachtelte
    // async-Logik im Callback und hält Fehlerbehandlung im äußeren try/catch.
    const role = await getRoleForUser(user.samAccountName, user.memberOf || []);

    // SECURITY-REVIEW 3.1 (16.07.2026): kein Treffer in ad_group_roles =
    // explizite Ablehnung. Vorher wurde in diesem Fall stillschweigend die
    // Rolle "helpdesk" vergeben - jeder gueltige AD-Account mit korrektem
    // Passwort bekam Zugriff, auch ausserhalb der vorgesehenen AD-Gruppen.
    // Kein session.regenerate(), kein encryptedCredential, keine Session -
    // der AD-Bind (Passwortpruefung) hat zwar schon stattgefunden (siehe
    // adLogin.execute() oben), aber ohne Gruppenzugehoerigkeit bleibt es bei
    // einer erfolgreich AUTHENTIFIZIERTEN, aber nicht AUTORISIERTEN Anfrage.
    if (!role) {
      req.audit.log({
        action:     ACTION_TYPES.ACCESS_DENIED,
        actor:      user.samAccountName,
        target:     user.samAccountName,
        targetType: "user",
        result:     "failure",
        details:    { reason: "not_in_authorized_ad_group" },
      });
      return res.status(403).json({
        error: "Zugriff verweigert. Ihr Konto ist keiner berechtigten Gruppe zugeordnet.",
      });
    }

    req.session.regenerate((err) => {
      if (err) return res.status(500).json({ error: "Session-Fehler beim Login." });

      req.session.user = {
        samAccountName: user.samAccountName,
        displayName:    user.displayName,
        loginAt:        new Date().toISOString(),
        lastActivity:   Date.now(),
        role,
      };

      req.session.encryptedCredential = encryptCredential(user.credential);

      req.audit.log({
        action:     ACTION_TYPES.LOGIN,
        actor:      user.samAccountName,
        target:     user.samAccountName,
        targetType: "user",
        result:     "success",
      });

      // permissions NICHT in der Session speichern (wie bei /me: immer frisch
      // aus dem Cache lesen), aber in der Login-Response mitgeben – sonst hat
      // der Frontend-State nach dem Login kein permissions-Array, bis die
      // Seite neu geladen wird und /me erneut aufgerufen wird.
      return res.json({
        ok: true,
        user: { ...req.session.user, permissions: getPermissionsForRole(role) },
      });
    });

  } catch (err) {
    console.error("[Login Fehler]", err.message);
	req.audit.log({
      action:     ACTION_TYPES.LOGIN_FAILED,
      actor:      username,
      target:     username,
      targetType: "user",
      result:     "failure",
      error:      err.message,
    });
    return res.status(401).json({ error: "Anmeldung fehlgeschlagen." });
  }
});

router.post("/logout", requireAuth, (req, res) => {
  const actor = req.session.user.samAccountName;
  req.audit.log({ action: ACTION_TYPES.LOGOUT, actor, target: actor, targetType: "user", result: "success" });
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.json({ ok: true });
  });
});

router.get("/me", requireAuth, (req, res) => {
  const { samAccountName, displayName, loginAt, role } = req.session.user;
  // permissions wird bei jedem /me frisch aus dem Cache gelesen (nicht in der
  // Session gespeichert) – damit wirken Rollenänderungen über die Konfigseite
  // (6.2, reloadCache()) sofort beim nächsten /me-Aufruf, ohne Re-Login.
  const permissions = getPermissionsForRole(role);
  res.json({ user: { samAccountName, displayName, loginAt, role, permissions } });
});

module.exports = router;