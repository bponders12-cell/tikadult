# Docker install & deploy runbook (self-contained demo)

This runbook brings up the full site as a self-contained Docker Compose stack (Caddy + app + Postgres + MinIO) gated by HTTP Basic Auth. It is intended for the demo at `tik.earnable.store`.

**Operational boundary:** the implementer verified everything a local Docker environment can verify (build, migrations/seed, S3/MinIO adapter, compose wiring as far as local runs allow). **The owner executes all steps that touch real cloud accounts and the real domain** (VM provisioning, DNS, firewall/ports, real Let's Encrypt issuance, and any managed services). The implementer never needs or requests owner cloud credentials.

## 1) Prerequisites

- A Linux VM (AWS EC2 / Azure VM or similar) with Docker Engine + Docker Compose v2 installed.
- Public IP reachable from the internet.
- Inbound firewall/security-group rules allowing **TCP 80 and 443** (HTTP/HTTPS).
- This repo cloned on the host (e.g. `/opt/tik`).
- `tik.earnable.store` (or your `SITE_DOMAIN`) available for DNS.

Notes:
- The stack is self-contained and adds no managed-service cost beyond the host VM (budget target ~$100/month).
- Payments are intentionally inert (fake provider) in this demo; do not wire a real provider here.

## 2) DNS

Create an **A record** for `SITE_DOMAIN` (e.g. `tik.earnable.store`) pointing to the VM's public IP.

- DNS must resolve publicly **before** Caddy can obtain a real Let's Encrypt certificate.
- You can verify from your workstation: `nslookup tik.earnable.store` (or `dig`) should return the VM IP.

## 3) Configure environment (`.env`)

From the repo root on the host:

```bash
cp .env.example .env
```

Edit `.env` and replace every placeholder. Required values (see `.env.example` for comments):

- `SITE_DOMAIN`, `ACME_EMAIL`
- `BASIC_AUTH_USER`, `BASIC_AUTH_HASH` (HTTP Basic Auth gate — demo must stay gated)
- `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `DATABASE_URL`
- `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`
- `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_REGION`
- `NEXTAUTH_SECRET`, `NEXTAUTH_URL`
- `PAYMENT_PROVIDER`, `PAYMENTS_WEBHOOK_SECRET`
- Optional bootstrap: `SEED_ADMIN_EMAIL`, `SEED_ADMIN_HANDLE`, `SEED_ADMIN_PASSWORD_HASH`

### Generate secrets/values

**`NEXTAUTH_SECRET` (>= 32 chars), strong random:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# or: openssl rand -hex 32
```

**HTTP Basic Auth hash for Caddy (`BASIC_AUTH_HASH`):**
```bash
docker run --rm caddy:2-alpine caddy hash-password --plaintext 'your-strong-password'
```
- Copy the full bcrypt hash into `BASIC_AUTH_HASH` in `.env`. If you paste into a compose env context, ensure `$` characters are preserved as required by your shell/editor (the provided `.env.example` shows the value quoted).

**Important consistency checks:**
- `NEXTAUTH_URL` host must match `SITE_DOMAIN` (e.g. `https://tik.earnable.store`).
- For the demo stack, `S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY` should match `MINIO_ROOT_USER`/`MINIO_ROOT_PASSWORD`, and `S3_ENDPOINT` should be `http://minio:9000` with `S3_REGION=auto`.

`.env` is gitignored and must never be committed.

## 4) Launch

Run the pre-boot validator and start the stack:

```bash
chmod +x install.sh
./install.sh
```

`install.sh` checks `.env` exists, all required vars are set, validates `NEXTAUTH_SECRET` length, `SITE_DOMAIN` format, and that `NEXTAUTH_URL` host matches `SITE_DOMAIN`, then runs `docker compose up -d --build`. It exits non-zero with specific messages on validation failure.

**Windows/PowerShell host:** use `install.ps1` (equivalent validation + `docker compose up -d --build`).

What starts (internal network): `caddy` (public 80/443), `app` (internal 3000), `postgres` (internal, `pgdata` volume), `minio` (internal, `miniodata` volume). On boot the app entrypoint waits for Postgres, runs `prisma migrate deploy`, seeds (idempotent), ensures the S3 bucket exists, then starts the server.

## 5) Verify

1. Browse to `https://<SITE_DOMAIN>/` (or `https://tik.earnable.store`).
2. Confirm the **HTTP Basic Auth prompt** appears; authenticate with `BASIC_AUTH_USER` / your password.
3. Log in as the seeded admin (if `SEED_ADMIN_*` were provided) or create/login as appropriate for your setup.
4. Confirm a basic upload round-trip works: upload media, verify it processes/stores, and plays back in the feed (bytes served by the app from MinIO/S3 storage through the gated site).
5. Confirm API health (from inside the app container or via gated URL as appropriate): `GET /api/health` returns `{"status":"ok"}`.

**Local TLS note:** real Let's Encrypt issuance requires a public domain pointing to a public IP (owner-executed). For local-only testing without a public domain, adjust `Caddyfile` to a local block (e.g. `localhost` with `tls internal` or `:80`) and set `SITE_DOMAIN`/`NEXTAUTH_URL` accordingly; do not expect public ACME certs locally.

## 6) Operate

**Logs:**
```bash
docker compose logs -f          # all services
docker compose logs -f app      # app only
docker compose logs -f caddy
```

**Restart:**
```bash
docker compose restart app
# or full stack:
docker compose up -d
```

**Re-deploy/update:** pull latest code, ensure `.env` is correct, then `./install.sh` (rebuilds/recreates as needed). Startup steps are idempotent.

**Backups (named volumes):** back up `pgdata` (Postgres) and `miniodata` (object storage), plus keep `.env` stored securely off-host. Example patterns:
```bash
# Postgres dump (adjust user/db/service names to match .env)
docker compose exec -T postgres pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > backup.sql

# Volume snapshots (stop or quiesce as appropriate for consistency)
docker run --rm -v <project>_pgdata:/data -v "$PWD":/backup alpine tar czf /backup/pgdata.tar.gz -C /data .
docker run --rm -v <project>_miniodata:/data -v "$PWD":/backup alpine tar czf /backup/miniodata.tar.gz -C /data .
```
(Replace `<project>` with the compose project prefix; verify volume names via `docker volume ls`.)

**Switch to managed services later (one-env-var/config change, no code change):**
- Managed Postgres (e.g. RDS): point `DATABASE_URL` at the managed instance.
- Real AWS S3 (or other S3-compatible): set `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_REGION` accordingly. The same adapter serves MinIO and AWS S3 via path-style addressing and env-driven config.

## Security / gating reminders

- Keep **HTTP Basic Auth** enabled and credentials private until moderation/tooling (Plan 5) and other launch requirements are in place.
- Do not publish Postgres or MinIO ports publicly; only Caddy should be exposed.
- Keep secrets out of git and logs. Rotate credentials if exposed.
- Real cloud/domain/TLS steps and production hardening/monitoring beyond this demo are owner-operated and must be validated on the host.
