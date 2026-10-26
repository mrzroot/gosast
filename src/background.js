/*
 * Gosast background script.
 *
 * Clicking the toolbar button (or pressing Alt+Shift+K) does three things on
 * the current tab, all inside this browser:
 *   1. takes a picture of the visible part of the page (needs only "activeTab"),
 *   2. injects the engine files into that tab,
 *   3. hands the picture to the engine.
 * Clicking again while it is open closes it. Nothing is sent anywhere.
 */
const api = globalThis.browser || globalThis.chrome;
const FILES = ['strings.js', 'core.js', 'engine.js', 'content.js'];

/** Only ordinary web pages. Browser pages, the extension store and PDFs viewers are refused by the browser anyway. */
function isWebPage(url) { return /^https?:\/\//i.test(url || ''); }

async function flagProblem(tabId) {
  try {
    await api.action.setBadgeBackgroundColor({ tabId, color: '#b3365f' });
    await api.action.setBadgeText({ tabId, text: '!' });
    setTimeout(() => api.action.setBadgeText({ tabId, text: '' }).catch(() => {}), 2500);
  } catch (e) { /* the tab may be gone */ }
}

async function toggle(tab) {
  if (!tab || tab.id == null || !isWebPage(tab.url)) { if (tab && tab.id != null) flagProblem(tab.id); return; }
  const target = { tabId: tab.id };
  try {
    // already open? then close it
    const [probe] = await api.scripting.executeScript({ target, func: () => !!(globalThis.__gosast && globalThis.__gosast.active) });
    if (probe && probe.result) {
      await api.scripting.executeScript({ target, func: () => globalThis.__gosast.stop() });
      return;
    }
    // take the picture BEFORE anything is added to the page, so the overlay is not in it
    const dataUrl = await api.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
    await api.scripting.executeScript({ target, files: FILES });
    await api.scripting.executeScript({ target, func: (url) => globalThis.__gosast.start(url), args: [dataUrl] });
  } catch (e) {
    console.warn('Gosast could not start on this tab:', e && e.message);
    flagProblem(tab.id);
  }
}

api.action.onClicked.addListener(toggle);
