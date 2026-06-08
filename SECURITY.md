# Security & Privacy

## Threat model

Hermes Chrome Bridge is a client that connects your browser to a **Hermes Agent
server you control**. Design choices that bound the attack surface:

- **Network access is centralized in the background service worker.** Content
  scripts and panel pages never hold the API key or call the server directly.
- **Host access is opt-in.** The extension ships only
  `optional_host_permissions`; the configured Hermes origin is requested at
  runtime when you save Settings, so the extension can reach exactly that server
  and nothing else by default.
- **No remote code.** Everything is bundled; the extension never loads or
  `eval`s code from the network. Rendered Markdown is sanitized with DOMPurify.

### Data sent off the device

- Messages you type, and — only when you enable **Page context** — the current
  tab's selection (preferred) or extracted text, are sent to **your** Hermes
  server. The page-context toggle makes this explicit and per-message.
- For light, private tasks you can switch on **On-device** mode, which answers
  with Chrome's built-in model (Gemini Nano) and makes **no network calls**.

### Known limitations

- The **API key is stored in `chrome.storage.local` in clear text**. Storage is
  isolated per-extension, but local malware or a compromised extension with
  broad permissions could read it. For shared/hosted deployments prefer
  short-lived tokens or an OAuth/PKCE flow rather than a long-lived bearer key.
- The content script matches `<all_urls>` so page context works anywhere; it is
  passive and only responds to an explicit request from the background worker.

## Reporting a vulnerability

Please open a private security advisory on the GitHub repository (Security →
Advisories) rather than a public issue. We aim to acknowledge within a few days.
