/**
 * org.js – Organisations-RBAC: Abteilungen und Rollen
 *
 * Permissions:
 *   org:read  – it-admin + it-lead
 *   org:write – nur it-lead
 *
 * Jede Schreiboperation → Audit-Log mit Vorher/Nachher-Diff
 */

const express               = require('express');
const { requireAuth }       = require('../middleware/authMiddleware');
const { requirePermission } = require('../middleware/rbac');
const db                    = require('../data/db'); // pg Pool

const router = express.Router();
router.use(requireAuth);

// ─── Hilfsfunktion: JSON-Diff für Audit-Log ──────────────────────────────────

function diff(before, after) {
  const changes = {};
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  for (const key of keys) {
    if (JSON.stringify(before?.[key]) !== JSON.stringify(after?.[key])) {
      changes[key] = { before: before?.[key], after: after?.[key] };
    }
  }
  return changes;
}

// ═══════════════════════════════════════════════════════════════════════════════
// DEPARTMENTS
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/org/departments
router.get('/departments', requirePermission('org:read'), async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM org_departments ORDER BY name'
    );
    res.json({ departments: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/org/departments
router.post('/departments', requirePermission('org:write'), async (req, res) => {
  const { name, ad_ou, description } = req.body;
  if (!name?.trim() || !ad_ou?.trim()) {
    return res.status(400).json({ error: 'name und ad_ou sind erforderlich.' });
  }
  try {
    const { rows } = await db.query(
      `INSERT INTO org_departments (name, ad_ou, description)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [name.trim(), ad_ou.trim(), description?.trim() || null]
    );
    req.audit.log({
      action: 'ORG_DEPARTMENT_CREATE', target: rows[0].id.toString(),
      targetType: 'org_department', result: 'success',
      details: { after: rows[0] },
    });
    res.status(201).json({ department: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: `Abteilung "${name}" existiert bereits.` });
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/org/departments/:id
router.put('/departments/:id', requirePermission('org:write'), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'Ungültige ID.' });

  const { name, ad_ou, description } = req.body;
  if (!name?.trim() || !ad_ou?.trim()) {
    return res.status(400).json({ error: 'name und ad_ou sind erforderlich.' });
  }
  try {
    const before = await db.query('SELECT * FROM org_departments WHERE id = $1', [id]);
    if (!before.rows.length) return res.status(404).json({ error: 'Abteilung nicht gefunden.' });

    const { rows } = await db.query(
      `UPDATE org_departments
       SET name = $1, ad_ou = $2, description = $3, updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [name.trim(), ad_ou.trim(), description?.trim() || null, id]
    );
    req.audit.log({
      action: 'ORG_DEPARTMENT_UPDATE', target: id.toString(),
      targetType: 'org_department', result: 'success',
      details: diff(before.rows[0], rows[0]),
    });
    res.json({ department: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: `Name "${name}" bereits vergeben.` });
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/org/departments/:id
router.delete('/departments/:id', requirePermission('org:write'), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'Ungültige ID.' });

  try {
    const before = await db.query('SELECT * FROM org_departments WHERE id = $1', [id]);
    if (!before.rows.length) return res.status(404).json({ error: 'Abteilung nicht gefunden.' });

    await db.query('DELETE FROM org_departments WHERE id = $1', [id]);
    req.audit.log({
      action: 'ORG_DEPARTMENT_DELETE', target: id.toString(),
      targetType: 'org_department', result: 'success',
      details: { before: before.rows[0] },
    });
    res.json({ ok: true });
  } catch (err) {
    // FK-Verletzung: Rollen hängen noch dran
    if (err.code === '23503') return res.status(409).json({ error: 'Abteilung hat noch Rollen — bitte zuerst löschen.' });
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ROLES
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/org/roles?department_id=
router.get('/roles', requirePermission('org:read'), async (req, res) => {
  try {
    const deptId = req.query.department_id ? parseInt(req.query.department_id, 10) : null;
    const { rows } = deptId
      ? await db.query('SELECT * FROM org_roles WHERE department_id = $1 ORDER BY name', [deptId])
      : await db.query('SELECT * FROM org_roles ORDER BY name');
    res.json({ roles: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/org/roles
router.post('/roles', requirePermission('org:write'), async (req, res) => {
  const { department_id, name, ad_groups, mailbox_database, mailbox_size_mb, manual_tasks, description } = req.body;
  if (!department_id || !name?.trim()) {
    return res.status(400).json({ error: 'department_id und name sind erforderlich.' });
  }
  try {
    const { rows } = await db.query(
      `INSERT INTO org_roles
         (department_id, name, ad_groups, mailbox_database, mailbox_size_mb, manual_tasks, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        department_id,
        name.trim(),
        JSON.stringify(ad_groups || []),
        mailbox_database?.trim() || null,
        mailbox_size_mb || null,
        JSON.stringify(manual_tasks || []),
        description?.trim() || null,
      ]
    );
    req.audit.log({
      action: 'ORG_ROLE_CREATE', target: rows[0].id.toString(),
      targetType: 'org_role', result: 'success',
      details: { after: rows[0] },
    });
    res.status(201).json({ role: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: `Rolle "${name}" existiert bereits in dieser Abteilung.` });
    if (err.code === '23503') return res.status(400).json({ error: 'Abteilung nicht gefunden.' });
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/org/roles/:id
router.put('/roles/:id', requirePermission('org:write'), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'Ungültige ID.' });

  const { name, ad_groups, mailbox_database, mailbox_size_mb, manual_tasks, description } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name ist erforderlich.' });

  try {
    const before = await db.query('SELECT * FROM org_roles WHERE id = $1', [id]);
    if (!before.rows.length) return res.status(404).json({ error: 'Rolle nicht gefunden.' });

    const { rows } = await db.query(
      `UPDATE org_roles
       SET name = $1, ad_groups = $2, mailbox_database = $3,
           mailbox_size_mb = $4, manual_tasks = $5, description = $6, updated_at = NOW()
       WHERE id = $7
       RETURNING *`,
      [
        name.trim(),
        JSON.stringify(ad_groups || []),
        mailbox_database?.trim() || null,
        mailbox_size_mb || null,
        JSON.stringify(manual_tasks || []),
        description?.trim() || null,
        id,
      ]
    );
    req.audit.log({
      action: 'ORG_ROLE_UPDATE', target: id.toString(),
      targetType: 'org_role', result: 'success',
      details: diff(before.rows[0], rows[0]),
    });
    res.json({ role: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: `Name "${name}" bereits in dieser Abteilung vergeben.` });
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/org/roles/:id
router.delete('/roles/:id', requirePermission('org:write'), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'Ungültige ID.' });

  try {
    const before = await db.query('SELECT * FROM org_roles WHERE id = $1', [id]);
    if (!before.rows.length) return res.status(404).json({ error: 'Rolle nicht gefunden.' });

    await db.query('DELETE FROM org_roles WHERE id = $1', [id]);
    req.audit.log({
      action: 'ORG_ROLE_DELETE', target: id.toString(),
      targetType: 'org_role', result: 'success',
      details: { before: before.rows[0] },
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;