# goanon Yivi relay

The extension cannot safely talk directly to an IRMA/Yivi server in production: browser CORS, requestor authentication, and result polling belong on a tiny backend. This relay is that backend.

It exposes the two endpoints already used by `src/issuers.ts`:

- `POST /session` — starts a Yivi disclosure session and returns `{ token, sessionPtr, frontendRequest }` from the upstream IRMA server.
- `GET /session/result/{token}` — polls the upstream IRMA server's `/session/{token}/result` endpoint and returns the disclosure result.

The relay intentionally accepts only the configured date-of-birth disclosure attribute by default:

```text
pbdf.gemeente.personalData.dateofbirth
```

## Run the Go relay

```bash
cd relay/go
YIVI_IRMA_SERVER=http://127.0.0.1:8088 \
CORS_ORIGIN='*' \
PORT=8787 \
go run .
```

## Run the Node.js relay

```bash
YIVI_IRMA_SERVER=http://127.0.0.1:8088 \
CORS_ORIGIN='*' \
PORT=8787 \
node relay/node/server.mjs
```

## Docker

```bash
docker build -t goanon-yivi-relay -f relay/go/Dockerfile .
docker run --rm -p 8787:8787 \
  -e YIVI_IRMA_SERVER=https://irma.example.org \
  goanon-yivi-relay
```

```bash
docker build -t goanon-yivi-relay-node -f relay/node/Dockerfile .
docker run --rm -p 8787:8787 \
  -e YIVI_IRMA_SERVER=https://irma.example.org \
  goanon-yivi-relay-node
```

## Environment variables

| Variable | Default | Meaning |
|---|---:|---|
| `PORT` | `8787` | HTTP port for the relay. |
| `YIVI_IRMA_SERVER` | `http://127.0.0.1:8088` | Base URL of your IRMA/Yivi server. |
| `YIVI_REQUESTOR_AUTHORIZATION` | empty | Full `Authorization` header value to send to the IRMA/Yivi server, if requestor auth is enabled. |
| `YIVI_REQUESTOR_TOKEN` | empty | Convenience fallback for `YIVI_REQUESTOR_AUTHORIZATION`. Use the full value expected by your server. |
| `YIVI_ATTRIBUTE` | `pbdf.gemeente.personalData.dateofbirth` | The only attribute the relay will allow clients to request. |
| `CORS_ORIGIN` | `*` | Set to your extension origin in production if you want strict CORS. |
| `SESSION_TTL` | `10m` | How long the relay accepts result polls for a started token. Go supports `10m`, `1h`; Node supports `ms`, `s`, `m`, `h`. |

## Expected flow

1. The extension calls `POST /session` with the disclosure request.
2. The relay forwards the request to `${YIVI_IRMA_SERVER}/session`.
3. The extension renders `sessionPtr.u` as a QR code.
4. The Yivi app scans the QR and talks directly to the public IRMA/Yivi server.
5. The extension polls `GET /session/result/{token}` until it sees `status: "DONE"` and `proofStatus: "VALID"`.

## Production notes

- Put the relay behind HTTPS. The Yivi app expects a reachable HTTPS IRMA/Yivi server for normal production sessions.
- Run the actual IRMA/Yivi server separately; this relay is only the requestor backend and CORS boundary.
- If your IRMA/Yivi server uses requestor authentication, set `YIVI_REQUESTOR_AUTHORIZATION` on the relay and never expose that value to the extension.
- Keep the relay stateless across restarts, except for in-memory active session tokens. Users can simply start a new QR session after a restart.
