// Encrypted System Settings & Sandbox Enforcement (REV-10, D7)
const crypto = require('crypto');

const RAW_KEY = process.env.SETTINGS_ENCRYPTION_KEY || process.env.JWT_SECRET || 'stridera-dev-settings-encryption-key-2026';

function getAesKey() {
  return crypto.createHash('sha256').update(String(RAW_KEY)).digest();
}

function encryptSetting(plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getAesKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decryptSetting(payload) {
  if (!payload || !payload.includes(':')) return '';
  const [ivHex, tagHex, dataHex] = payload.split(':');
  const decipher = crypto.createDecipheriv('aes-256-gcm', getAesKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]);
  return decrypted.toString('utf8');
}

function maskSecret(val) {
  if (!val) return null;
  const s = String(val);
  if (s.length <= 4) return '••••';
  return `••••••••${s.slice(-4)}`;
}

function assertSandboxKey(val, fieldName = 'API key') {
  if (!val) return;
  const lower = String(val).toLowerCase();
  if (lower.startsWith('sk_live') || lower.startsWith('pk_live') || lower.includes('_live_')) {
    const err = new Error(`Live-mode ${fieldName} is rejected. Sandbox/test keys only.`);
    err.statusCode = 400;
    throw err;
  }
}

module.exports = {
  encryptSetting,
  decryptSetting,
  maskSecret,
  assertSandboxKey
};
