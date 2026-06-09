# Changelog

## 1.3.1

End-to-end tests — which immediately caught a real regression.

### Fixed

- **Chat composer crashed on input.** `ChatStore`'s action methods were
  explicitly annotated `action` with `makeObservable`'s `autoBind`, which does
  **not** bind explicitly-annotated members — so `onChange={s.setInput}` ran with
  `this === undefined` and threw. Methods are now `action.bound`.

### Added

- **Playwright end-to-end tests** that load the unpacked extension in headless
  Chromium (`--headless=new`), drive Settings → save → chat, and assert the SSE
  answer renders — reusing the mock Hermes server. New `e2e/` suite, an E2E build
  mode (`build:e2e`, statically grants the loopback origin), and an **E2E CI
  workflow**.

## 1.3.0

Best-practices pass across the audit items.

### Added

- **Service-worker run resilience**: in-flight Runs are tracked in a persisted
  registry (`src/lib/runRegistry.ts`); on worker restart the background
  reconnects to each Run's event stream and notifies on completion.
- **Network retry/backoff** for non-streaming requests (`withRetry` + transient
  classification) so flaky discovery calls recover automatically.
- **Hybrid on-device AI**: when Chrome's built-in Prompt API (Gemini Nano) is
  available, an **On-device** toggle answers locally with no network calls;
  feature-detected with graceful fallback to Hermes.
- **i18n**: localized manifest name/description via `_locales` (`en`, `zh_CN`)
  and `default_locale`.
- **Dependabot** (npm + actions) and a **Release** workflow that packages the
  extension and attaches the zip to a `v*` tag.
- `SECURITY.md` threat model; README privacy / resilience / browser-support
  sections.
- Conversation history is capped (`MAX_STORED_MESSAGES`).
- **Integration tests**: a reusable OpenAI-compatible mock server
  (`src/test/mockHermesServer.ts`) exercised against `HermesClient` over real
  HTTP + SSE (models, streaming chat, runs + events, skills/sessions).

### Changed

- Migrated linting to **ESLint 9 flat config** (`eslint.config.js`) with
  `typescript-eslint` and the flat `react-hooks` preset.
- Code-split the Skills/Sessions/Settings views (`React.lazy` + `Suspense`).
- a11y: aria-labels on icon-only toggles.

### Notes

- Kept CRXJS rather than migrating to WXT (a framework swap mid-project is
  high-risk); cross-browser via a `browser.*` polyfill is documented as a
  follow-up. The HTTP/SSE layer now has real integration coverage; a full
  in-browser Playwright harness (reusing the mock server) is a future addition.

## 1.2.0

State management moved to **MobX**, eliminating React hooks from the app code.

### Changed

- Introduced `src/stores/` with observable stores: `SettingsStore`, `UiStore`,
  `CatalogStore` (skills/sessions), `ChatStore` (conversation + Port + streaming),
  and `SettingsFormStore` (form draft). Singletons are created once at module
  load and imported directly — no Context/Provider.
- All view components are now `observer()`s that read store state and call store
  actions. Removed `useState`/`useEffect`/`useRef`/`useMemo` and the custom
  `usePort` hook; `Markdown` uses `React.memo`. The codebase is hook-free.
- Side effects (Port connection/reconnect, settings/model/skills/session
  loading, pending-prompt consumption, conversation persistence, tab-driven
  lazy loading) are handled by store constructors and MobX `reaction`/`autorun`.
- `sendRuntime` moved to `src/lib/messaging.ts`.

### Added

- `ChatStore` unit tests (dispatch, streamed deltas, stale-request guard,
  no double-send, new chat).

## 1.1.1

Bug-fix release from a full code audit.

### Fixed

- **Side panel could fail to open from a context menu / omnibox.** The pending
  prompt was stored (`await`) before `chrome.sidePanel.open()`, which consumed
  the user gesture and could make `open()` throw. The panel now opens
  synchronously within the gesture, then the prompt is handed off.
- **Pending prompt applied twice / stale.** The prompt was delivered via both a
  broadcast payload and storage; an open panel never consumed the stored copy,
  so it could re-apply on a later open (or double auto-send). The broadcast is
  now a data-less poke and storage is the single source of truth, consumed
  exactly once (regression test added).
- **Lost responses during a port reconnect gap.** `usePort`'s `send()` fallback
  created a bare port with no listeners, dropping streamed replies; it now reuses
  the fully-wired connection.
- **React state was mutated in place** in the streaming message handler; it now
  produces new objects.
- **Model list stayed stale** after configuring the connection in Settings; it
  now refreshes when the base URL / API key change.
- Removed an unused `panelPorts` set.

## 1.1.0

Rebuilt the presentation layer on **Ant Design X** (the Agent-focused component
engine) and deepened Chrome integration.

### Added — Chrome surfaces

- **Context menus**: select text → "Ask Hermes about …"; right-click a page →
  "Summarize this page with Hermes" (opens the panel pre-filled).
- **Keyboard commands**: `Ctrl/Cmd+Shift+H` opens the side panel; a configurable
  "new chat" command (chrome://extensions/shortcuts).
- **Omnibox**: type `hermes <question>` in the address bar to ask the agent.
- **Notifications**: a Run started from the panel now keeps running even if the
  panel closes, and raises a desktop notification (with a snippet) when it
  finishes; clicking it reopens the panel.

### Changed — UI on Ant Design X

- Messages render with `Bubble.List`; the composer uses `Sender` (with built-in
  stop button); tool steps show in a `ThoughtChain`; the empty state uses
  `Welcome` + `Prompts`; sessions use the `Conversations` component; settings use
  antd `Form`. Theming via `XProvider` (dark algorithm, brand primary).

## 1.0.0

First production-ready release.

### Added

- **Markdown rendering** for assistant messages (GFM, code blocks, sanitized via DOMPurify, links open in a new tab).
- **Conversation persistence** across panel open/close, with a **New chat** action and per-message **Copy**.
- **Extension icons** (16/32/48/128) generated by a dependency-free script (`npm run icons`).
- **Automated tests** (Vitest) for the SSE decoder, list-envelope normalization, settings storage, and host-pattern building.
- **Linting/formatting** via ESLint + Prettier (`npm run lint` / `npm run format`).
- **CI** (GitHub Actions): type-check, lint, test, build, and icon-freshness check on push/PR.
- **Web Store packaging** (`npm run package`) producing a sourcemap-free `release/*.zip`.

### Changed

- Extracted a pure, unit-testable incremental SSE decoder (`createSseDecoder`).
- Extracted `originPattern` and `unwrapList` into reusable, tested helpers.

## 0.1.0

Initial Manifest V3 extension: side-panel chat with SSE streaming, page context,
Runs API, Skills/Sessions browsing, and a settings/connection-test flow against
the Hermes Agent OpenAI-compatible API.
