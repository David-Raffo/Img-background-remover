# Security Policy

## Supported versions

Only the latest version on the `main` branch receives security fixes.

## Reporting a vulnerability

Please do not open a public issue for security problems. Report them privately through
[GitHub Security Advisories](https://github.com/David-Raffo/Img-background-remover/security/advisories/new).

You can expect an initial response within a few days.

## Deployment recommendations

- The app has no authentication. Keep it on your local network, or put it behind a reverse proxy that adds authentication before exposing it to the internet.
- Serve it over HTTPS when it is reachable from outside your machine.
- Keep `MAX_UPLOAD_MB` and `MAX_FILES` as low as your use case allows: background removal is CPU and memory intensive, and large batches from untrusted users can exhaust the server.
- The container runs as an unprivileged user; do not override it with `--user root`.
