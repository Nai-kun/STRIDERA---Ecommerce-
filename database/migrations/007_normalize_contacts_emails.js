// One-shot & idempotent contact/email normalization script using validators.js rules.
// Safe to re-run; never deletes any existing user, address, or order row.

const fs = require('fs');
const path = require('path');
const { Pool } = require('../../backend/node_modules/pg');
const { normalizePhMobile, validateEmail } = require('../../backend/src/lib/validators');

function resolveDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envPath = path.join(__dirname, '../../backend/.env');
  if (fs.existsSync(envPath)) {
    const match = fs.readFileSync(envPath, 'utf8').match(/^DATABASE_URL=(.+)$/m);
    if (match) return match[1].trim();
  }
  return 'postgresql://postgres:postgres@127.0.0.1:5432/stridera';
}

async function run() {
  const pool = new Pool({ connectionString: resolveDatabaseUrl() });
  const client = await pool.connect();

  const summary = {
    emailsUpdated: 0,
    userPhonesUpdated: 0,
    addressPhonesUpdated: 0,
    orderPhonesUpdated: 0,
    unfixable: []
  };

  try {
    await client.query('BEGIN');

    // 1. Users (email + optional phone)
    const { rows: users } = await client.query('SELECT id, email, phone FROM users');
    const seenLowerEmails = new Map();
    for (const u of users) {
      const lower = String(u.email || '').trim().toLowerCase();
      if (!seenLowerEmails.has(lower)) seenLowerEmails.set(lower, []);
      seenLowerEmails.get(lower).push(u.id);
    }

    for (const u of users) {
      let nextEmail = u.email;
      const emailCheck = validateEmail(u.email, { required: true, applyPolicy: false });
      if (!emailCheck.valid) {
        summary.unfixable.push({ table: 'users', id: u.id, field: 'email', value: u.email, reason: emailCheck.error });
      } else if (emailCheck.value !== u.email) {
        const owners = seenLowerEmails.get(emailCheck.value) || [];
        if (owners.length > 1) {
          summary.unfixable.push({ table: 'users', id: u.id, field: 'email', value: u.email, reason: 'Duplicate lowercase email collision' });
        } else {
          nextEmail = emailCheck.value;
          summary.emailsUpdated += 1;
        }
      }

      let nextPhone = u.phone;
      if (u.phone !== null && u.phone !== '') {
        const phoneCheck = normalizePhMobile(u.phone, { required: false });
        if (!phoneCheck.valid) {
          summary.unfixable.push({ table: 'users', id: u.id, field: 'phone', value: u.phone, reason: phoneCheck.error });
        } else if (phoneCheck.value !== u.phone) {
          nextPhone = phoneCheck.value;
          summary.userPhonesUpdated += 1;
        }
      }

      if (nextEmail !== u.email || nextPhone !== u.phone) {
        await client.query('UPDATE users SET email = $1, phone = $2 WHERE id = $3', [nextEmail, nextPhone, u.id]);
      }
    }

    // 2. Addresses
    const { rows: addresses } = await client.query('SELECT id, phone FROM addresses');
    for (const a of addresses) {
      const phoneCheck = normalizePhMobile(a.phone, { required: true });
      if (!phoneCheck.valid) {
        summary.unfixable.push({ table: 'addresses', id: a.id, field: 'phone', value: a.phone, reason: phoneCheck.error });
      } else if (phoneCheck.value !== a.phone) {
        await client.query('UPDATE addresses SET phone = $1 WHERE id = $2', [phoneCheck.value, a.id]);
        summary.addressPhonesUpdated += 1;
      }
    }

    // 3. Orders
    const { rows: orders } = await client.query('SELECT id, order_number, shipping_phone FROM orders');
    for (const o of orders) {
      const phoneCheck = normalizePhMobile(o.shipping_phone, { required: true });
      if (!phoneCheck.valid) {
        summary.unfixable.push({ table: 'orders', id: o.id, orderNumber: o.order_number, field: 'shipping_phone', value: o.shipping_phone, reason: phoneCheck.error });
      } else if (phoneCheck.value !== o.shipping_phone) {
        await client.query('UPDATE orders SET shipping_phone = $1 WHERE id = $2', [phoneCheck.value, o.id]);
        summary.orderPhonesUpdated += 1;
      }
    }

    await client.query('COMMIT');
    console.log('✅ Migration 007_normalize_contacts_emails completed:', JSON.stringify(summary));
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration 007_normalize_contacts_emails failed:', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  run();
}

module.exports = { run };
