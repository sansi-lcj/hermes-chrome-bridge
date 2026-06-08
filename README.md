# hermes-chrome-bridge

A Chrome extension (Manifest V3) that bridges Chrome to a **deployed [Hermes Agent](https://github.com/nousresearch/hermes-agent)** and lets you use its capabilities while you browse.

Hermes Agent exposes an OpenAI-compatible HTTP API server. This extension talks to it from a docked **side panel**, with streaming chat, page context, long-running tasks (Runs API), and skill/session browsing.

## Features

- **Side-panel chat** with live token streaming (SSE) and a collapsible tool-progress trail.
- **Page context** — attach the current tab's selection or readable text to your message.
- **Runs mode** — drive long, autonomous tasks via the `/v1/runs` API with live events and cancel.
- **Skills & Sessions** — browse `/v1/skills`, `/v1/toolsets`, and `/api/sessions`.
- **Settings** — configure base URL, bearer key, default model/mode; one-click connection test.

All Hermes network calls run in the **background service worker**, which holds the API key and (with a granted host permission for your configured origin) reaches the server without any server-side CORS changes.

## Requirements

- A reachable Hermes Agent API server (`API_SERVER_ENABLED=true`, an `API_SERVER_KEY`, default port `8642`). Any OpenAI-compatible server works for smoke-testing the chat path.
- Node.js 18+ and Chrome 114+ (side panel support).

## Develop

```bash
npm install
npm run dev      # Vite + CRXJS with HMR
```

Then load the extension:

1. Open `chrome://extensions`, enable **Developer mode**.
2. Click **Load unpacked** and select the generated `dist/` folder (for `dev`, CRXJS writes `dist/` and reloads on change).

## Build

```bash
npm run typecheck   # tsc --noEmit
npm run build       # type-check + production build to dist/
```

Load `dist/` as an unpacked extension as above.

## Usage

1. Click the toolbar icon to open the side panel.
2. In **Settings**, enter your Hermes base URL and API key, grant the host-permission prompt, and click **Test connection**.
3. Chat from the **Chat** tab. Toggle **Run mode** for long tasks and **Page context** to include the current page.

## License

MIT
