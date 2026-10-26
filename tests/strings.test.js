// Unit tests for the English/Persian UI strings.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../src/strings.js');

test('English and Persian define exactly the same keys', () => {
  assert.deepEqual(Object.keys(S.STRINGS.fa).sort(), Object.keys(S.STRINGS.en).sort());
});

test('no string is empty', () => {
  for (const lang of ['en', 'fa']) for (const [k, v] of Object.entries(S.STRINGS[lang])) assert.ok(v.trim().length > 0, `${lang}.${k}`);
});

test('Persian strings really contain Persian letters (except the language switch)', () => {
  for (const [k, v] of Object.entries(S.STRINGS.fa)) {
    if (k === 'language') continue;      // it shows "English" on purpose
    assert.match(v, /[\u0600-\u06FF]/, `fa.${k} should be Persian`);
  }
});

test('placeholders match between languages', () => {
  const ph = (s) => (s.match(/\{\w+\}/g) || []).sort().join(',');
  for (const k of Object.keys(S.STRINGS.en)) assert.equal(ph(S.STRINGS.fa[k]), ph(S.STRINGS.en[k]), k);
});

test('detectLang picks Persian only for fa locales', () => {
  assert.equal(S.detectLang('fa'), 'fa');
  assert.equal(S.detectLang('fa-IR'), 'fa');
  assert.equal(S.detectLang('en-US'), 'en');
  assert.equal(S.detectLang('fr'), 'en');
  assert.equal(S.detectLang(undefined), 'en');
});

test('dir is rtl for Persian only', () => {
  assert.equal(S.dir('fa'), 'rtl');
  assert.equal(S.dir('en'), 'ltr');
});

test('t fills placeholders and falls back to English then to the key', () => {
  assert.equal(S.t('en', 'pieces', { n: 5 }), 'pieces torn: 5');
  assert.match(S.t('fa', 'pieces', { n: '۵' }), /۵/);
  assert.equal(S.t('de', 'exit'), S.STRINGS.en.exit);
  assert.equal(S.t('en', 'no_such_key'), 'no_such_key');
});

test('num writes Persian digits for fa and plain digits for en', () => {
  assert.equal(S.num('fa', 1204), '۱۲۰۴');
  assert.equal(S.num('en', 1204), '1204');
});
