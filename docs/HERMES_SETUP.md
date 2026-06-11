# Provisioning a Hermes channel for a user

This is the **server side** of getting someone connected with the
hermes-chrome-bridge extension. The extension only needs three values from you:

| Value        | What it is                                   | Example                      |
| ------------ | -------------------------------------------- | ---------------------------- |
| **Base URL** | The Hermes API server origin (no trailing /) | `https://hermes.example.com` |
| **API key**  | Bearer token sent as `Authorization: Bearer` | a secret you generate        |
| **Model**    | The `model` field sent on each request       | `hermes`                     |

The user pastes these into **Settings → Add account** in the extension.

---

## 1. What the extension expects from the server

The extension speaks the OpenAI-compatible subset below. Auth is a single
bearer token (sent only when set). The base URL has any trailing slash stripped.
This is the exact contract the bundled mock implements
(`scripts/mock-hermes.mjs`), so it is the source of truth:

| Method | Path                   | Used for                                                     |
| ------ | ---------------------- | ------------------------------------------------------------ |
| GET    | `/v1/models`           | **Test connection** + the model dropdown                     |
| POST   | `/v1/chat/completions` | Chat (SSE when `stream:true`); tool loop when `stream:false` |
| POST   | `/v1/runs`             | Start a long Run                                             |
| GET    | `/v1/runs/{id}/events` | Stream a Run's output (SSE)                                  |
| POST   | `/v1/runs/{id}/stop`   | Cancel a Run                                                 |
| GET    | `/v1/skills`           | Skills tab                                                   |
| GET    | `/v1/toolsets`         | Skills tab                                                   |
| GET    | `/api/sessions`        | Sessions tab                                                 |
| GET    | `/v1/health`           | Optional probe during Test connection                        |

> `/v1/chat/completions` and `/v1/runs/{id}/events` are **Server-Sent Events**.
> Any proxy in front of Hermes must not buffer them — see `deploy/`.

## 2. Turn on the Hermes API server

Per this repo's README, the embedded API server is enabled with:

```bash
# Generate a strong key for the channel
openssl rand -hex 32        # -> use as API_SERVER_KEY

API_SERVER_ENABLED=true \
API_SERVER_KEY=<that key> \
# default port 8642
<your command to start hermes-agent>
```

> ⚠️ **Confirm against your Hermes build.** Upstream's public docs currently
> document `hermes proxy` (an OpenAI-compatible server on port **8645**) rather
> than the `API_SERVER_*` env vars on **8642** that this extension was built
> against. The two are different server modes. Use whichever your deployment
> actually exposes — only the _endpoints_ in §1 and the bearer auth must match.
> If you run `hermes proxy`, your Base URL is `http://HOST:8645`.

## 3. Verify the channel (no extension needed)

```bash
curl -fsS https://hermes.example.com/v1/models \
  -H "Authorization: Bearer <API key>" | jq .
```

A JSON list of models (including the `model` id you'll hand out) means the
channel is live. The extension's **Test connection** button calls exactly this.

Quick SSE sanity check:

```bash
curl -N https://hermes.example.com/v1/chat/completions \
  -H "Authorization: Bearer <API key>" -H 'Content-Type: application/json' \
  -d '{"model":"hermes","stream":true,"messages":[{"role":"user","content":"hi"}]}'
```

You should see incremental `data:` frames, ending with `data: [DONE]`.

## 4. Reachability

- **Same machine as Chrome:** `http://127.0.0.1:8642` works as-is.
- **Remote user:** bind Hermes to `0.0.0.0`, put it behind HTTPS, and hand out
  an `https://…` Base URL. Don't expose the raw single-key server to the
  internet — front it with the reverse proxy in [`deploy/`](../deploy/README.md),
  which gives each user their own revocable token.

## 5. One user vs many

The embedded server authenticates with **one shared `API_SERVER_KEY`**. So:

- **A single user** → just give them that key.
- **Multiple users, each with a revocable key** → don't share the master key.
  Run the reverse proxy in [`deploy/`](../deploy/README.md): it validates a
  per-user token and swaps in the master key upstream. Revoke a user by deleting
  their token and reloading.

See [`CONNECT.md`](./CONNECT.md) for the page to hand the end user.
