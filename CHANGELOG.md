# Changelog

## 1.7.0

Hardening + a modernized panel, both backed by tests.

### Fixed

- **Chat no longer hangs in “streaming…” when the MV3 worker is recycled** mid
  response — the panel detects the dropped Port, stops the spinner, and notes the
  interruption (`stores/chat.ts`; regression test added).
- **Tool-confirmation never parks the agent loop.** Extracted a tested
  `ConfirmBroker`: a confirmation resolves false on deny, timeout, **Stop
  (abort)**, or panel close, and pending prompts are flushed on disconnect.
- **Panel surface no longer flashes white / shows invisible text** — antd's dark
  algorithm themes components but injects a light `body` reset; the surface is
  now painted on `#root`, and the full-height flex chain is kept through antd's
  `.ant-app` wrapper so the composer pins to the bottom.

### Changed — modern UI

- Composer options are now compact **pill toggles** (Run / Page / Tools /
  Auto-run / On-device) instead of a cramped switch row; a slim header shows a
  **connection-status dot**, the model picker, and New chat.
- The action-confirmation card shows a **human-readable summary**
  (“Open https://…”, “Click element #3”) via the tested `actionSummary`, not raw
  JSON.

### Added — tests

- `@testing-library/react` set up; **component tests** for `Markdown` (incl. XSS
  sanitization) and the full `SettingsView` save flow.
- Unit tests for `ConfirmBroker` (approve/deny/timeout/abort/flush) and
  `actionSummary`. 83 unit/integration + 4 E2E.

## 1.6.1

Local hands-on verification tooling.

### Added

- **Mock Hermes dev server** (`npm run mock`, `scripts/mock-server.mjs`): a
  deterministic OpenAI-compatible server on `http://127.0.0.1:8642` so you can
  exercise chat streaming, the tool-loop, action confirmation, runs, and the
  discovery tabs in a real Chrome **without a deployed backend**.
- README "Verify locally" walkthrough.

## 1.6.0

Page **perception + DOM actions** — the agent can now operate the page, with
confirmation-gated writes. A real agentic-browser step.

### Added

- **Perception**: `get_page_elements` indexes the active page's interactive
  elements (links/buttons/inputs) via the content script (`src/lib/dom.ts`).
- **Actions**: `click_element`, `type_text`, `scroll_page`, `navigate_to` — the
  agent references elements by index and the content script performs the action.
- **Confirmation gating**: write/action tools (`click`, `type`, `navigate`,
  `open_url`) prompt for **Allow/Deny** before running; an **Auto-run** toggle
  skips prompts for power users. `createGuardedRunner` + a confirm round-trip
  over the Port; the UI shows an inline approval card.
- Tests: jsdom element-collection, tool relays, the confirmation guard, the
  store confirm round-trip, and an **E2E** that approves a write tool. 67 unit +
  4 E2E.

## 1.5.0

Agent **browser tools** — the Hermes Agent can now use Chrome's capabilities.

### Added

- **Tool-use loop**: with the new **Agent tools** toggle, the agent can call
  browser tools via OpenAI-style function calling. The background runs each tool
  through Chrome APIs and feeds the result back until the agent answers; tool
  steps appear in the message's ThoughtChain. Round-capped (`MAX_TOOL_ROUNDS`).
- **Tools** (using already-granted permissions — no new prompts): `list_tabs`,
  `read_active_page`, `open_url` (`src/lib/tools.ts`).
- `HermesClient.chatCompletion` (non-streaming) + `runToolLoop`; the mock server
  now supports the tool-call round-trip.
- Tests: tool executors, the tool-loop integration test, and an E2E that enables
  tools and verifies the agent calls `list_tabs` then answers. 59 unit tests +
  3 E2E.

## 1.4.0

Migrated state management from **MobX to Zustand**.

### Changed

- `src/stores/` are now Zustand stores (`settings`, `ui`, `catalog`, `chat`,
  `settingsForm`). Components read state with selector hooks
  (`useChatStore((s) => …)`) instead of `observer()`; removed `mobx` and
  `mobx-react-lite`.
- The chat store keeps the Port / streaming machinery as module functions and
  drives the store via `getState()/setState()`; updates are immutable.
- Cross-store reactions (settings → model reload, tab → catalog load,
  conversation persistence) are wired once in `stores/index.ts` with
  `store.subscribe(...)`; `initStores()` performs the initial load and Port
  connect. `ChatStore` tests ported to the Zustand store; E2E unchanged and green.

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
