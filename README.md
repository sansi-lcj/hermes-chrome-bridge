# hermes-chrome-bridge

A Chrome extension (Manifest V3) that bridges Chrome to a **deployed [Hermes Agent](https://github.com/nousresearch/hermes-agent)** and lets you use its capabilities while you browse.

Hermes Agent exposes an OpenAI-compatible HTTP API server. This extension talks to it from a docked **side panel**, with streaming chat, page context, long-running tasks (Runs API), and skill/session browsing.

The UI is built on **[Ant Design X](https://x.ant.design/)** — Ant Design's component engine for AI/Agent interfaces (Bubble, Sender, ThoughtChain, Conversations, Welcome/Prompts).

## Features

- **Side-panel chat** on Ant Design X with live token streaming (SSE), **Markdown rendering** (code blocks with one-click copy, lists, links), and a `ThoughtChain` tool-progress trail.
- **Conversations, Chatbox-style** — every account keeps a full conversation list (auto-titled, renamable, deletable) in a drawer; **New chat** starts fresh without losing anything, and history survives closing the panel.
- **Message actions** — copy any message, **regenerate** the last answer, or delete a turn.
- **Per-conversation system prompt** — set standing instructions from the header; they ride ahead of every message of that chat.
- **Page context** — attach the current tab's selection or readable text to your message.
- **Runs mode** — drive long, autonomous tasks via the `/v1/runs` API. Runs keep going even if you close the panel and notify you when finished.
- **Agent tools** — toggle **Tools** to let the agent operate your browser via function calling: **perceive** the page (`get_page_elements`, `read_active_page`, `list_tabs`) and **act** on it (`click_element`, `type_text`, `scroll_page`, `navigate_to`, `open_url`). Each tool step shows in the tool trail. Write/action tools prompt for **Allow/Deny** by default (an **Auto-run** toggle skips prompts). Uses already-granted permissions only.
- **Skills & Sessions** — browse `/v1/skills`, `/v1/toolsets`, and `/api/sessions`.
- **Multiple accounts** — manage several Hermes accounts (each its own base URL / API key / model), switch the active one from the header, with **per-account chat history**.
- **Settings** — manage accounts; one-click connection test.

### Chrome integration

- **Context menus** — select text → "Ask Hermes about …"; right-click a page → "Summarize this page with Hermes".
- **Keyboard shortcuts** — `Ctrl/Cmd+Shift+H` opens the panel; a "new chat" command (customizable at `chrome://extensions/shortcuts`).
- **Omnibox** — type `hermes <question>` in the address bar to ask the agent.
- **Desktop notifications** — long Runs ping you when they complete, even if the panel is closed.

All Hermes network calls run in the **background service worker**, which holds the API key and (with a granted host permission for your configured origin) reaches the server without any server-side CORS changes.

## Requirements

- A reachable Hermes Agent API server (`API_SERVER_ENABLED=true`, an `API_SERVER_KEY`, default port `8642`). Any OpenAI-compatible server works for smoke-testing the chat path.
- Node.js 20+ and Chrome 114+ (side panel support).

## Install (from source)

```bash
npm install
npm run build
```

Then load it:

1. Open `chrome://extensions`, enable **Developer mode**.
2. Click **Load unpacked** and select the generated `dist/` folder.

## Verify locally (no backend required)

A built-in **mock Hermes server** lets you exercise every feature on your own
machine without a deployed agent:

```bash
npm run mock     # starts a mock Hermes on http://127.0.0.1:8642
npm run build    # then Load unpacked → dist/  (in another terminal)
```

Then in the side panel:

1. **Settings** → base URL `http://127.0.0.1:8642`, any API key → grant the
   permission prompt → **Test connection** (expect `hermes, hermes-pro`).
2. **Chat** → send a message → watch the streamed `**Hello** from the mock…`.
3. **Tools** on → ask _"what tabs are open?"_ → the agent calls `list_tabs` and
   answers (tool steps show in the trail).
4. Tools on (Ask mode) → ask _"please run an action"_ → an **Allow/Deny** card
   appears for `open_url`; **Allow** runs it.
5. **Skills**, **Sessions** tabs populate; **Run mode** streams via the Runs API.

Point the same Settings at your real Hermes URL to verify against your backend.

## Usage

1. Click the toolbar icon to open the side panel.
2. In **Settings**, enter your Hermes base URL and API key, grant the host-permission prompt, and click **Test connection**.
3. Chat from the **Chat** tab. Toggle **Run mode** for long tasks and **Page context** to include the current page. If your machine supports Chrome's built-in AI, an **On-device** toggle appears that answers locally (no network).

## Resilience

Runs started via the Runs API are tracked in a persisted registry, so if the
MV3 service worker is recycled mid-task the worker reconnects to the Run's event
stream on restart and notifies you on completion. Transient network failures on
discovery requests are retried with exponential backoff.

## Privacy & security

All Hermes calls run from the background worker; the API key never leaves it.
Page content is sent only when you enable **Page context** (selection preferred),
and **On-device** mode keeps everything local. See [SECURITY.md](./SECURITY.md)
for the full threat model and known limitations.

## Browser support

Built and tested for **Chrome/Edge** (Chromium, MV3, side panel). Firefox would
additionally need a `browser.*` polyfill — not yet wired up.

## Development

```bash
npm run dev         # Vite + CRXJS with HMR (writes dist/, reloads on change)
npm run typecheck   # tsc --noEmit
npm run test        # Vitest unit + integration tests
npm run e2e         # Playwright E2E: build the extension and drive it in Chromium
npm run lint        # ESLint 9 (flat config) + Prettier check
npm run format      # Prettier --write
npm run icons       # regenerate PNG icons from scripts/generate-icons.mjs
npm run package     # build + zip a Web Store archive into release/
```

CI runs type-check, lint, tests, build, and an icon-freshness check
(`ci.yml`), plus the Playwright end-to-end suite (`e2e.yml`) on every push and
PR. The E2E tests load the unpacked extension in headless Chromium and exercise
the Settings → chat flow against the mock Hermes server.

## Architecture

```
sidepanel (React) ⇄ Port ⇄ background SW ⇄ fetch/SSE ⇄ Hermes API
                                 └⇄ tabs.sendMessage ⇄ content script (page context)
```

- `src/lib/hermesClient.ts` — typed API client + incremental SSE decoder
- `src/lib/accounts.ts`, `src/lib/conversation.ts` — account & per-account chat
  persistence (`storage.ts` is the account-agnostic facade over the active one)
- `src/background/index.ts` — owns all Hermes access, streams over a Port
- `src/content/index.ts` — supplies page context on demand
- `src/stores/**` — **Zustand** stores: `settings`, `ui`, `catalog`,
  `chat` (conversation + Port + streaming), `settingsForm`
- `src/sidepanel/**` — React UI; components read state via Zustand hooks
  (`useChatStore((s) => …)`)

### State management

State lives in **Zustand** stores (created at module load, imported directly —
no Context/Provider). Components subscribe with selector hooks
(`useStore((s) => s.field)`); store actions and the non-reactive machinery (the
Port, streaming) live in the store modules. Cross-store side effects (settings →
model reload, tab → catalog load, conversation persistence) are wired once in
`stores/index.ts` via `store.subscribe(...)`, and `initStores()` kicks off the
initial load and Port connection.

## License

MIT
