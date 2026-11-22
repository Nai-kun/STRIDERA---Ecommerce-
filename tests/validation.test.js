// STRIDERA Single-Source-of-Truth Input Validation Test Suite
// Run with: node --test tests/validation.test.js

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const v = require('../backend/src/lib/validators');

describe('1. PH Mobile Validation & Canonical Normalization', () => {
  it('accepts canonical +63 9XX-XXX-YYYY and typed variants', () => {
    const variants = [
      '+63 917-123-4567',
      '09171234567',
      '9171234567',
      '639171234567',
      '+639171234567',
      '0917 123 4567',
      '(0917) 123-4567',
      '  +63 917 123 4567  '
    ];
    for (const raw of variants) {
      const res = v.normalizePhMobile(raw, { required: true });
      assert.equal(res.valid, true, `Expected valid for ${raw}`);
      assert.equal(res.value, '+63 917-123-4567');
      assert.match(res.value, v.PH_MOBILE_REGEX);
    }
  });

  it('rejects wrong prefix, wrong length, landlines, non-PH country codes, and letters', () => {
    const invalid = [
      '',
      '   ',
      '08171234567',
      '+63 817-123-4567',
      '021234567',
      '81234567',
      '+1 917-123-4567',
      '0917123456',
      '091712345678',
      '+63 917-abc-4567',
      '0917-123-456x'
    ];
    for (const raw of invalid) {
      const res = v.normalizePhMobile(raw, { required: true });
      assert.equal(res.valid, false, `Expected invalid for "${raw}"`);
      assert.equal(res.error, v.PH_MOBILE_ERROR);
    }
  });

  it('allows blank/null when optional but still enforces format when provided', () => {
    assert.deepEqual(v.normalizePhMobile('', { required: false }), { valid: true, value: null, error: null });
    assert.deepEqual(v.normalizePhMobile('   ', { required: false }), { valid: true, value: null, error: null });
    assert.equal(v.normalizePhMobile('12345', { required: false }).valid, false);
  });
});

describe('2. Email Validation, Normalization & EMAIL_POLICY', () => {
  it('trims, lowercases, and validates name@domain.tld without collapsing dots or +tags', () => {
    assert.equal(v.EMAIL_POLICY, 'ANY_VALID_DOMAIN');

    const ok = v.validateEmail('  Juan.DelaCruz+promo@Gmail.Com  ');
    assert.equal(ok.valid, true);
    assert.equal(ok.value, 'juan.delacruz+promo@gmail.com');

    const corp = v.validateEmail('staff@stridera.ph');
    assert.equal(corp.valid, true);
    assert.equal(corp.value, 'staff@stridera.ph');
  });

  it('rejects malformed emails with canonical error text', () => {
    const invalid = [
      '',
      '   ',
      'plainaddress',
      'a@@b.com',
      'bad..dots@gmail.com',
      'has space@gmail.com',
      'user@localhost',
      'user@domain.c',
      `${'a'.repeat(250)}@gmail.com`
    ];
    for (const raw of invalid) {
      const res = v.validateEmail(raw, { required: true });
      assert.equal(res.valid, false, `Expected invalid email for "${raw}"`);
      assert.equal(res.error, v.EMAIL_ERROR);
    }
  });

  it('supports GMAIL_ONLY policy when applyPolicy is true and bypasses policy on login', () => {
    const blockedOnSignup = v.validateEmail('buyer@yahoo.com', { applyPolicy: true, policy: 'GMAIL_ONLY' });
    assert.equal(blockedOnSignup.valid, false);
    assert.match(blockedOnSignup.error, /@gmail\.com/);

    const allowedGmail = v.validateEmail('buyer@gmail.com', { applyPolicy: true, policy: 'GMAIL_ONLY' });
    assert.equal(allowedGmail.valid, true);

    const allowedOnLogin = v.validateEmail('admin@stridera.ph', { applyPolicy: false, policy: 'GMAIL_ONLY' });
    assert.equal(allowedOnLogin.valid, true);
  });
});

describe('3. Person, Entity, Password, Address & Product Field Rules', () => {
  it('validates person names vs shop/brand/product names', () => {
    assert.equal(v.validatePersonName("Maria O'Connor-Santos Jr.", 'First name').valid, true);
    assert.equal(v.validatePersonName('A', 'First name').valid, false);
    assert.equal(v.validatePersonName('Juan123', 'First name').valid, false);
    assert.equal(v.validatePersonName('   ', 'First name').valid, false);

    assert.equal(v.validateEntityName('Apex Footwear Hub', 'Store name').valid, true);
    assert.equal(v.validateEntityName('<b>Apex</b>', 'Store name').valid, false);
  });

  it('enforces password strength (8+ chars, 1 letter, 1 number) and never trims passwords', () => {
    assert.equal(v.validatePassword('short1').valid, false);
    assert.equal(v.validatePassword('allletters').valid, false);
    assert.equal(v.validatePassword('12345678').valid, false);
    const spaced = v.validatePassword(' Pass1234 ');
    assert.equal(spaced.valid, true);
    assert.equal(spaced.value, ' Pass1234 ');
  });

  it('validates street, city/province, postal code, and optional text/URLs', () => {
    assert.equal(v.validateStreet('Abcd').valid, false);
    assert.equal(v.validateStreet('123 Ayala Ave').valid, true);
    assert.equal(v.validateCityOrProvince('Makati', 'City').valid, true);
    assert.equal(v.validateCityOrProvince('  ', 'Province').valid, false);
    assert.equal(v.validatePostalCode('1226').valid, true);
    assert.equal(v.validatePostalCode('123').valid, false);
    assert.equal(v.validatePostalCode('12A4').valid, false);
    assert.equal(v.validateOptionalText('', 'Notes').value, null);
    assert.equal(v.validateOptionalText('<script>x</script>', 'Notes').valid, false);
    assert.equal(v.validateOptionalUrl('https://track.lbc.com/123', 'URL').valid, true);
    assert.equal(v.validateOptionalUrl('javascript:alert(1)', 'URL').valid, false);
  });

  it('validates product price, stock, size, color, and cart quantity', () => {
    assert.deepEqual(v.validatePricePesos('5495.50').value, 549550);
    assert.equal(v.validatePricePesos('0').valid, false);
    assert.equal(v.validatePricePesos('-10').valid, false);
    assert.equal(v.validatePricePesos('99.999').valid, false);

    assert.equal(v.validateStock('0').value, 0);
    assert.equal(v.validateStock('-1').valid, false);
    assert.equal(v.validateStock('1.5').valid, false);

    assert.equal(v.validateShoeSize('9.5').valid, true);
    assert.equal(v.validateShoeSize('99').valid, false);

    assert.equal(v.validateColor('Black/Lime').valid, true);
    assert.equal(v.validateColor('  ').valid, false);

    assert.equal(v.validateQuantity(2, 5).value, 2);
    assert.equal(v.validateQuantity(0, 5).valid, false);
    assert.equal(v.validateQuantity(6, 5).valid, false);
  });

  it('keeps frontend/lib/validation.js constants and behavior aligned with backend validators.js', async () => {
    const feUrl = pathToFileURL(path.join(__dirname, '../frontend/lib/validation.js')).href;
    const fe = await import(feUrl);

    assert.equal(fe.EMAIL_POLICY, v.EMAIL_POLICY);
    assert.equal(fe.PH_MOBILE_ERROR, v.PH_MOBILE_ERROR);
    assert.equal(fe.EMAIL_ERROR, v.EMAIL_ERROR);
    assert.equal(fe.PH_MOBILE_REGEX.source, v.PH_MOBILE_REGEX.source);
    assert.deepEqual(fe.ALLOWED_SHOE_SIZES, v.ALLOWED_SHOE_SIZES);
    assert.equal(fe.formatPhMobileInput('09171234567'), '+63 917-123-4567');
    assert.equal(fe.normalizePhMobile('+63 ', { required: false }).valid, true);
    assert.equal(fe.normalizePhMobile('+63 ', { required: true }).valid, false);
    assert.equal(fe.normalizePhMobile('09171234567').value, '+63 917-123-4567');
  });
});
