# Changelog

All notable changes to Gosast. Dates are release dates (YYYY-MM-DD).

## Unreleased

- Docs only: a demo GIF and a right-to-left screenshot (both taken from the real-Chrome end-to-end run), this changelog, CONTRIBUTING.md and a pull-request template. No change to the extension.

## 0.1.1 (2026-10-26)

The first release under the name **Gosast** (گسست). There is no change in behaviour.

- Renamed from the earlier working name in the manifest, locales, UI strings, globals and shadow-host attribute.
- Package, zip files and Firefox add-on id renamed, so the build produces `gosast-<version>-<browser>.zip`.
- READMEs (EN and FA), CITATION.cff, issue forms and banners updated to the new name, with an explanation of the Persian word.

## 0.1.0 (2026-10-26)

First public release.

- Tools: strips, confetti, broom, glue, shred all, rewind, gentle mode and optional synthesized paper sounds. Esc restores the page.
- Tears a picture of the visible page inside a closed shadow-DOM overlay; the real page is never modified.
- Permissions: `activeTab` and `scripting` only. No network requests and no data collection.
- English and Persian UI (L switches language); Alt+Shift+K shortcut.
- Chrome/Edge (Manifest V3) and Firefox 142+ builds.
- Unit tests for geometry, physics, strings and packaging, plus a real-Chrome end-to-end check that the page is restored byte for byte.
