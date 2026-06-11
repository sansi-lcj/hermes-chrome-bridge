# Per-user channels in front of a single-key Hermes

The Hermes API server authenticates with **one** `API_SERVER_KEY`. To give each
user their own **revocable** credential without sharing that master key, put a
thin reverse proxy in front that:

1. accepts a **per-user bearer token** from the extension,
2. allows it only if it's on the issued list,
3. **replaces** it with the master key before forwarding upstream,
4. streams SSE through untouched (no buffering).

```
extension ──Bearer tok_alice──►  proxy (443, TLS)  ──Bearer MASTER──►  Hermes (127.0.0.1:8642)
                                  └ validates token, rewrites header, streams SSE
```

The user's **Base URL** becomes `https://hermes.example.com` (no port), **API
key** is their personal `tok_…`, **Model** is whatever Hermes exposes.

## Issue a token per user

```bash
printf 'tok_%s_%s\n' alice "$(openssl rand -hex 16)"
# -> tok_alice_9f3c…  (hand this to Alice as her API key)
```

Keep a simple map of `user → token`. **Revoke** = delete the line and reload the
proxy. Tokens are secrets: don't log the `Authorization` header.

## Caddy (recommended — automatic HTTPS)

`Caddyfile` validates tokens via a CEL list and rewrites the header. Caddy gets
a real certificate for your domain automatically.

```bash
export HERMES_UPSTREAM_KEY="<the API_SERVER_KEY>"
caddy run --config deploy/Caddyfile
```

Add/remove users by editing the token list in the `@valid` matcher, then
`caddy reload`.

## nginx (if you already run it)

`nginx.conf` does the same with a `map`. nginx doesn't expand env vars at
runtime, so render the master key in at deploy time:

```bash
export HERMES_UPSTREAM_KEY="<the API_SERVER_KEY>"
envsubst '$HERMES_UPSTREAM_KEY' < deploy/nginx.conf > /etc/nginx/conf.d/hermes.conf
nginx -t && nginx -s reload
```

Terminate TLS with certbot (`certbot --nginx -d hermes.example.com`).

## The one thing that breaks Hermes behind a proxy: **SSE buffering**

`/v1/chat/completions` (streaming) and `/v1/runs/{id}/events` are Server-Sent
Events. If the proxy buffers responses, tokens arrive all at once at the end (or
the stream stalls). Both configs here disable buffering:

- **Caddy:** `flush_interval -1`
- **nginx:** `proxy_buffering off;` + `proxy_http_version 1.1;` + `Connection ""`

Keep read timeouts long (Runs can stream for minutes).
