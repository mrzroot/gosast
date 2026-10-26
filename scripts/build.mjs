// Build the Chrome/Edge and Firefox packages from src/ into dist/ and zip them.
//   node scripts/build.mjs            -> dist/chrome, dist/firefox, dist/parpar-<version>-chrome.zip, ...-firefox.zip
//   node scripts/build.mjs --test-host -> adds a throw-away copy dist/chrome-test (see e2e/README) - never released
// Only the manifest differs between browsers; every other file is copied as is.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src'), DIST = path.join(ROOT, 'dist');
const manifest = JSON.parse(fs.readFileSync(path.join(SRC, 'manifest.json'), 'utf8'));

/** Chrome and Edge keep the source manifest unchanged (service worker). */
export function chromeManifest(m) { return structuredClone(m); }

/** Firefox: an event page instead of a service worker, plus an add-on id and "no data collected". */
export function firefoxManifest(m) {
  const f = structuredClone(m);
  f.background = { scripts: ['background.js'] };
  f.browser_specific_settings = {
    gecko: { id: 'parpar@mrzroot.github.io', strict_min_version: '128.0', data_collection_permissions: { required: ['none'] } }
  };
  return f;
}

function copyTree(from, to) { fs.cpSync(from, to, { recursive: true }); }

function files(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? files(p, base) : [path.relative(base, p).split(path.sep).join('/')];
  }).sort();
}

// ---- a tiny zip writer (deflate), so the build needs no extra tools or packages ----
const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
function crc32(buf) { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

export function zipDir(dir, outFile) {
  const parts = [], central = [];
  let offset = 0;
  const date = new Date('2026-01-01T00:00:00Z');   // fixed timestamp so the same input gives the same zip
  const dosTime = 0, dosDate = ((date.getUTCFullYear() - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate();
  for (const rel of files(dir)) {
    const data = fs.readFileSync(path.join(dir, rel)), comp = zlib.deflateRawSync(data, { level: 9 });
    const name = Buffer.from(rel), crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(8, 8);
    local.writeUInt16LE(dosTime, 10); local.writeUInt16LE(dosDate, 12); local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comp.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(name.length, 26);
    parts.push(local, name, comp);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(8, 10);
    c.writeUInt16LE(dosTime, 12); c.writeUInt16LE(dosDate, 14); c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(comp.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(name.length, 28); c.writeUInt32LE(offset, 42);
    central.push(c, name);
    offset += local.length + name.length + comp.length;
  }
  const cdSize = central.reduce((n, b) => n + b.length, 0), n = central.length / 2;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(n, 8); end.writeUInt16LE(n, 10); end.writeUInt32LE(cdSize, 12); end.writeUInt32LE(offset, 16);
  fs.writeFileSync(outFile, Buffer.concat([...parts, ...central, end]));
}

function emit(name, m) {
  const out = path.join(DIST, name);
  fs.rmSync(out, { recursive: true, force: true });
  copyTree(SRC, out);
  fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(m, null, 2) + '\n');
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });
  const v = manifest.version;
  for (const [name, m] of [['chrome', chromeManifest(manifest)], ['firefox', firefoxManifest(manifest)]]) {
    const dir = emit(name, m);
    const zip = path.join(DIST, `parpar-${v}-${name}.zip`);
    zipDir(dir, zip);
    console.log(`${name}: ${files(dir).length} files -> ${path.relative(ROOT, zip)} (${(fs.statSync(zip).size / 1024).toFixed(1)} KB)`);
  }
  if (process.argv.includes('--test-host')) {
    // e2e helper only: a copy that is allowed to run on a local test server without a click.
    const m = chromeManifest(manifest);
    m.host_permissions = ['http://127.0.0.1/*', 'http://localhost/*'];
    emit('chrome-test', m);
    console.log('chrome-test: built (never released)');
  }
}
