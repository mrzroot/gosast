# Contributing

Thanks for helping. Small pull requests with a test are the easiest to review.

```bash
git clone https://github.com/mrzroot/gosast.git && cd gosast
npm install          # puppeteer-core, used by the end-to-end check only
npm test             # 34 unit tests, under a second, no network
npm run build        # dist/chrome, dist/firefox and the two zip files
npm run e2e          # optional: real Chrome under xvfb, 88 checks, screenshots in e2e/out/
```

Ground rules:

- **No new permissions and no network.** Gosast uses only `activeTab` and `scripting`. `tests/package.test.js` fails if shipped code makes a request.
- **Never modify the page.** All drawing happens on a picture inside the overlay. The end-to-end check compares the page's HTML, form values, focus, scroll and pixels before and after; keep it green.
- **Both languages.** Every new UI string goes in English and Persian in `src/strings.js`; `tests/strings.test.js` keeps them in sync.
- **Respect reduced motion.** New effects need a calm path under `prefers-reduced-motion` and in gentle mode.
- **Be honest in docs.** If you have only tested in Chrome, say so.

Useful contributions: Firefox test reports, pages where the overlay misbehaves, translations, and the roadmap items in the README.

Bug reports: use the issue forms and include the browser, its version and a public page where it happens.
