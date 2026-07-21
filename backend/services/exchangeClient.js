/**
 * exchangeClient.js – Exchange On-Prem Mailbox-Verwaltung
 *
 * Wrapper um ExchangeMailbox und CheckExchangeDatabase in psWorker.ps1.
 * Analog zu adClient.js — gleiche Pool-Logik, gleiche Fehlerbehandlung.
 */

const { getPool } = require('./powershellBridge');

const EXCHANGE_CREDENTIAL = {
  username: process.env.EXCHANGE_SERVICE_ACCOUNT,
  password: process.env.EXCHANGE_SERVICE_PASSWORD,
};

async function run(params) {
  const pool   = await getPool();
  const result = await pool.run('ExchangeMailbox', params, EXCHANGE_CREDENTIAL);
  if (!result.ok) throw new Error(result.error || 'Exchange-Fehler');
  return result.data;
}

/**
 * Mailbox aktivieren (Enable-Mailbox)
 */
async function enableMailbox(sam, database) {
  return run({ sam, database, action: 'enable' });
}

/**
 * Mailbox konfigurieren (Set-Mailbox — Quotas, Default Policy)
 */
async function configureMailbox(sam, sizeMb = null) {
  return run({ sam, sizeMb, action: 'configure' });
}

/**
 * Mailbox aktivieren + konfigurieren in einem Aufruf
 */
async function provisionMailbox(sam, database, sizeMb = null) {
  return run({ sam, database, sizeMb, action: 'both' });
}

/**
 * Prüft ob eine Exchange-Mailbox-Datenbank existiert und gemountet ist.
 */
async function checkDatabase(database) {
  const pool   = await getPool();
  const result = await pool.run('CheckExchangeDatabase', { database }, EXCHANGE_CREDENTIAL);
  if (!result.ok) throw new Error(result.error || 'Exchange-Datenbankprüfung fehlgeschlagen');
  return result.data;
}

async function ping() {
  const pool   = await getPool();
  const result = await pool.run('PingExchange', {}, EXCHANGE_CREDENTIAL);
  return result.ok;
}

module.exports = {
  enableMailbox,
  configureMailbox,
  provisionMailbox,
  checkDatabase,
  ping,
};