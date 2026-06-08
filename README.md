# hermes-chrome-bridge

A Chrome extension (Manifest V3) that bridges Chrome to a **deployed [Hermes Agent](https://github.com/nousresearch/hermes-agent)** and lets you use its capabilities while you browse.

Hermes Agent exposes an OpenAI-compatible HTTP API server. This extension talks to it from a docked **side panel**, with streaming chat, page context, long-running tasks (Runs API), and skill/session browsing.

The UI is built on **[Ant Design X](https://x.ant.design/)** — Ant Design's component engine for AI/Agent interfaces (Bubble, Sender, ThoughtChain, Conversations, Welcome/Prompts).

## Features

- **Side-panel chat** on Ant Design X with live token streaming (SSE), **Markdown rendering** (code blocks, lists, links), and a `ThoughtChain` tool-progress trail.
- **Conversation persistence** — your chat survives closing the panel; start fresh with **New chat**.
- **Page context** — attach the current tab's selection or readable text to your message.
- **Runs mode** — drive long, autonomous tasks via the `/v1/runs` API. Runs keep going even if you close the panel and notify you when finished.
- **Skills & Sessions** — browse `/v1/skills`, `/v1/toolsets`, and `/api/sessions`.
- **Settings** — configure base URL, bearer key, default model/mode; one-click connection test.

### Chrome integration

- **Context menus** — select text → "Ask Hermes about …"; right-click a page → "Summarize this page with Hermes".
- **Keyboard shortcuts** — `Ctrl/Cmd+Shift+H` opens the panel; a "new chat" command (customizable at `chrome://extensions/shortcuts`).
- **Omnibox** — type `hermes <question>` in the address bar to ask the agent.
- **Desktop notifications** — long Runs ping you when they complete, even if the panel is closed.

All Hermes network calls run in the **background service worker**, which holds the API key and (with a granted host permission for your configured origin) reaches the server without any server-side CORS changes.

## Requirements

- A reachable Hermes Agent API server (`API_SERVER_ENABLED=true`, an `API_SERVER_KEY`, default port `8642`). Any OpenAI-compatible server works for smoke-testing the chat path.
- Node.js 18+ and Chrome 114+ (side panel support).

## Install (from source)

```bash
npm install
npm run build
```

Then load it:

1. Open `chrome://extensions`, enable **Developer mode**.
2. Click **Load unpacked** and select the generated `dist/` folder.

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
npm run test        # Vitest unit tests
npm run lint        # ESLint + Prettier check
npm run format      # Prettier --write
npm run icons       # regenerate PNG icons from scripts/generate-icons.mjs
npm run package     # build + zip a Web Store archive into release/
```

CI (`.github/workflows/ci.yml`) runs type-check, lint, tests, build, and an icon-freshness check on every push and PR.

## Architecture

```
sidepanel (React) ⇄ Port ⇄ background SW ⇄ fetch/SSE ⇄ Hermes API
                                 └⇄ tabs.sendMessage ⇄ content script (page context)
```

- `src/lib/hermesClient.ts` — typed API client + incremental SSE decoder
- `src/lib/storage.ts`, `src/lib/conversation.ts` — settings & chat persistence
- `src/background/index.ts` — owns all Hermes access, streams over a Port
- `src/content/index.ts` — supplies page context on demand
- `src/stores/**` — **MobX** state: `SettingsStore`, `UiStore`, `CatalogStore`,
  `ChatStore` (conversation + Port + streaming), `SettingsFormStore`
- `src/sidepanel/**` — React UI; components are MobX `observer()`s that read the
  stores (no hooks — state and side effects live in the stores)

### State management

State is held in MobX stores (singletons created at module load, imported
directly — no Context/Provider). View components are `observer()`-wrapped and
simply read observables and call store actions; side effects run via store
constructors and `reaction`/`autorun`, so the UI code is hook-free.

## License

MIT
