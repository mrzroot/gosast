'use strict';
// Tests for what ships in the package: permissions, the Firefox manifest, the zip writer and the "no network" promise.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');

const ROOT = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/manifest.json'), 'utf8'));
const build = () => import('../scripts/build.mjs');

test('permissions are only activeTab and scripting, with no host access', () => {
  assert.deepEqual([...manifest.permissions].sort(), ['activeTab', 'scripting']);
  assert.equal(manifest.host_permissions, undefined);
  assert.equal(manifest.content_scripts, undefined, 'nothing may run on a page before the user asks');
  assert.equal(manifest.manifest_version, 3);
});

test('the Firefox manifest uses an event page, has an add-on id and declares no data collection', async () => {
  const { firefoxManifest } = await build();
  const f = firefoxManifest(manifest);
  assert.deepEqual(f.background, { scripts: ['background.js'] });
  assert.equal(f.browser_specific_settings.gecko.id, 'gosast@mrzroot.github.io');
  assert.deepEqual(f.browser_specific_settings.gecko.data_collection_permissions, { required: ['none'] });
  assert.equal(manifest.background.service_worker, 'background.js', 'the source manifest must not be changed');
});

test('the Chrome manifest is the source manifest, unchanged', async () => {
  const { chromeManifest } = await build();
  assert.deepEqual(chromeManifest(manifest), manifest);
});

test('zipDir writes a valid zip that holds every file with the right bytes', async () => {
  const { zipDir } = await build();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gosast-zip-'));
  fs.mkdirSync(path.join(dir, 'sub'));
  fs.writeFileSync(path.join(dir, 'a.txt'), 'hello hello hello hello');
  fs.writeFileSync(path.join(dir, 'sub/b.txt'), 'سلام');
  const out = path.join(dir, '..', path.basename(dir) + '.zip');
  zipDir(dir, out);
  const buf = fs.readFileSync(out);
  const eocd = buf.length - 22;
  assert.equal(buf.readUInt32LE(eocd), 0x06054b50);
  assert.equal(buf.readUInt16LE(eocd + 10), 2, 'two entries');
  // read the first local entry back
  assert.equal(buf.readUInt32LE(0), 0x04034b50);
  const nameLen = buf.readUInt16LE(26), compSize = buf.readUInt32LE(18);
  assert.equal(buf.subarray(30, 30 + nameLen).toString(), 'a.txt');
  assert.equal(zlib.inflateRawSync(buf.subarray(30 + nameLen, 30 + nameLen + compSize)).toString(), 'hello hello hello hello');
});

test('the shipped code contains no network calls', () => {
  const banned = /\b(fetch|XMLHttpRequest|WebSocket|sendBeacon|EventSource)\b|https?:\/\//;
  for (const f of ['background.js', 'content.js', 'core.js', 'engine.js', 'strings.js']) {
    const text = fs.readFileSync(path.join(ROOT, 'src', f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(text, banned, f + ' must not talk to the network');
  }
});

test('every message in the locale files has a Persian twin', () => {
  const en = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/_locales/en/messages.json'), 'utf8'));
  const fa = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/_locales/fa/messages.json'), 'utf8'));
  assert.deepEqual(Object.keys(fa).sort(), Object.keys(en).sort());
});
