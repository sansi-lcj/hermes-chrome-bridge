# Connect to your Hermes Agent

A 2-minute setup. You'll need three things from whoever runs your Hermes server:

- **Base URL** — e.g. `https://hermes.example.com` (or `http://127.0.0.1:8642` locally)
- **API key** — your personal token
- **Model** — usually `hermes`

## Steps

1. **Open the side panel.** Click the Hermes icon in the toolbar (or pin it
   first via the puzzle-piece menu).

2. **Go to Settings** (the gear tab) → **Add account**.

3. **Fill in the three fields:**
   - **Name** — anything, e.g. "Work"
   - **Hermes base URL** — your Base URL (no trailing slash)
   - **API key (bearer token)** — your token
   - **Default model / agent** — `hermes`

4. **Grant the permission prompt.** Chrome asks to let the extension reach your
   server's address — click **Allow**. (This is what lets the background worker
   talk to your server directly; the key never leaves the worker.)

   > Note: the permission covers the host on **all ports**, because Chrome can't
   > scope a permission to a single port.

5. **Click "Test connection".** You should see "Connected. Models: …". That's it
   — switch to the **Chat** tab and start talking.

## If Test connection fails

| Message                                                               | Likely cause                                                                                                            |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **Unauthorized (401)**                                                | Wrong API key, or your token was revoked.                                                                               |
| **Network error contacting Hermes…**                                  | Wrong Base URL, server down/unreachable, or you denied the host permission (re-open Settings and re-save to re-prompt). |
| **Not found (404)**                                                   | The URL points at something that isn't the Hermes API (check host/port and that the API server is enabled).             |
| Connects, but **no streaming** (answer appears all at once or stalls) | A proxy in front of Hermes is buffering SSE — tell your admin (see `deploy/`).                                          |

## Good to know

- **Multiple servers?** Add more accounts and switch the active one from the
  chat header. Each keeps its own chat history.
- **Privacy:** all requests run from the extension's background worker straight
  to the server you configured. Conversations/page content go only there.
