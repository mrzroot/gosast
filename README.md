<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/banner-dark.png">
  <img alt="Gosast — tear any page into paper strips. Esc puts everything back." src="assets/banner-light.png" width="100%">
</picture>

**English** · [فارسی](README.fa.md) · [🌸 Live demo](https://mrzroot.github.io/gosast/)

[![License: MIT](https://img.shields.io/badge/license-MIT-b3365f.svg)](LICENSE)
[![Manifest V3](https://img.shields.io/badge/manifest-V3-5b3a2e.svg)](src/manifest.json)
[![Permissions](https://img.shields.io/badge/permissions-activeTab%20%2B%20scripting-ff7aa8.svg)](#-privacy)
[![Network](https://img.shields.io/badge/network-none-2a1a14.svg)](#-privacy)
[![Chrome · Edge · Firefox](https://img.shields.io/badge/Chrome%20%C2%B7%20Edge%20%C2%B7%20Firefox-ready-7a2e48.svg)](#-install-from-source)

</div>

**Gosast** (Persian *گسست*, "a clean breaking apart") is a small, calm browser toy. Click the button, and the page you are looking at turns into a sheet of paper on a desk. Tear it into strips, scatter confetti, sweep the pieces into a pile, glue some back, or feed the whole sheet to the shredder. Press **Esc** and the real page is exactly as you left it. 🌸

It is made for a quiet minute, not for stress: soft paper sounds (off by default), a **gentle mode** that fades instead of falling, and an undo for everything.

## ✨ What you can do

| Key | Tool | What it does |
| --- | --- | --- |
| `1` | ✂️ **Strips** | Drag across the page to tear out paper strips that fall and pile up |
| `2` | 🎉 **Confetti** | Click or drag to punch out tiny squares |
| `3` | 🧹 **Broom** | Sweep the loose pieces sideways |
| `4` | 🧴 **Glue** | Pieces under the glue fly back to where they came from |
| `S` | 🗑️ **Shred all** | A blade sweeps down and shreds everything |
| `R` | ⏪ **Rewind** | Every piece returns, top first |
| `G` | 🍃 **Gentle** | Pieces drift and fade (on automatically if your system asks for reduced motion) |
| `M` | 🔈 **Sound** | Synthesized paper sounds, off by default |
| `L` | 🌐 **Language** | Switch the toolbar between English and فارسی |
| `Esc` | 🌷 **Put it back** | Closes Gosast. The page is untouched |

Everything works with the keyboard too: arrow keys move a virtual pointer (hold `Shift` for bigger steps), `Enter` or `Space` presses and releases. The interface comes in **English and فارسی** (right-to-left aware) and follows your browser language.

## 🔒 Privacy

- **No network.** Gosast makes no requests at all. There are no servers, no analytics, no accounts.
- **No data collection.** Nothing about a page is stored, logged or sent. The picture of the page lives in memory until you close Gosast.
- **Tiny permissions.** Only `activeTab` and `scripting`, and no host permissions. Gosast can only run on a tab *after* you click its button (or press its shortcut), and only on that tab.
- **Reversible.** Gosast never edits your page. See below.

## 🧵 How it works

1. You click the toolbar button (or press `Alt+Shift+K`). The browser grants `activeTab` for that one tab.
2. The background script takes a **picture of the visible part of the page**, then injects four small scripts.
3. The scripts draw that picture onto a `<canvas>` inside a **closed shadow-DOM overlay** covering the viewport. All the tearing happens on the picture: it is cut into 14 px cells, strips are runs of cells, and a small physics step makes the pieces fall, stack in a pile height-field and fly home on springs.
4. Your real page is **never modified**. The only change in its DOM is one overlay element, added at the start and removed on exit. Forms keep their values, focus and scroll position; keystrokes are swallowed while the overlay is open so typing cannot reach a field.

Because it is a picture, Gosast works the same on any page, whatever its CSP, frameworks or shadow DOM.

## 📦 Install from source

You need Node 18+ only to build the zip files; the extension itself has no dependencies.

```bash
git clone https://github.com/mrzroot/gosast.git
cd gosast
npm test            # 34 unit tests
npm run build       # creates dist/chrome, dist/firefox and the two zip files
```

**Chrome / Edge / Brave**
1. Open `chrome://extensions` (Edge: `edge://extensions`) and turn on **Developer mode**.
2. Click **Load unpacked** and choose the `dist/chrome` folder.
3. Pin the 🌸 button, open any web page, and click it. Or press `Alt+Shift+K`.

**Firefox 142+**
1. Open `about:debugging#/runtime/this-firefox` and click **Load Temporary Add-on…**.
2. Choose `dist/firefox/manifest.json`.
3. Temporary add-ons disappear when Firefox closes. For a permanent install you need the signed release from the add-on store (not published yet).

Release zips (`gosast-0.1.0-chrome.zip`, `gosast-0.1.0-firefox.zip`) are attached to each [GitHub release](https://github.com/mrzroot/gosast/releases).

## 🧪 Tests

- `npm test` runs readable unit tests for the geometry and physics (`tests/core.test.js`), the English/Persian strings (`tests/strings.test.js`) and the package itself (`tests/package.test.js`: permissions, Firefox manifest, zip, no network calls). Each test has a one-line docstring explaining what it protects.
- `npm run e2e` loads the built extension into real Chrome under a virtual display and drives it on a static page, a forms page, a right-to-left Persian page, a reduced-motion page and a live Wikipedia article. It checks that the page's HTML, form values, focus, scroll position and pixels are identical afterwards, that the page saw exactly two DOM changes (host added, host removed), and that there were no console errors and no network requests while the overlay was open. Screenshots go to `e2e/out/`.

## 🚧 Limits

- It tears a **picture of the visible part** of the page, not the whole scrolling document. The page cannot scroll while Gosast is open.
- Resizing the window closes Gosast (the picture would no longer fit).
- It does not run on browser pages (`chrome://`, the add-on stores, `about:`), and PDFs in the built-in viewer are not supported.
- Videos and animations are frozen at the moment of the picture.
- Very large screens with thousands of pieces can slow down on old computers; the piece count is capped at 5000.
- The Firefox build is checked with `web-ext lint` and the same code runs in Chrome; it has not been tested in a real Firefox yet.

## 🗺️ Roadmap

- [ ] Store listings for Chrome Web Store, Edge Add-ons and Firefox Add-ons
- [ ] Scroll the page first, then tear a different part
- [ ] A "tear the whole page" mode that stitches several screenshots
- [ ] More tools: scissors lines, tape, a gust of wind
- [ ] Save a picture of the torn page as a PNG
- [ ] More languages (translations are welcome, see `src/strings.js`)

## 📄 License

[MIT](LICENSE) © 2026 Mohammadreza Zare ([@mrzroot](https://github.com/mrzroot)). Gosast is an original work. If you use it in research or a blog, [CITATION.cff](CITATION.cff) has a ready-made citation.
