#!/bin/sh
set -eu

log() { printf '[entrypoint] %s\n' "$*"; }
fail() { printf '[entrypoint] ERROR: %s\n' "$*" >&2; exit 1; }

# Wait for Postgres (bounded retries)
if [ -n "${DATABASE_URL:-}" ]; then
  log "Waiting for Postgres..."
  i=0
  max=60
  until node -e "const u=new URL(process.env.DATABASE_URL);const net=require('net');const s=net.connect({host:u.hostname,port:Number(u.port||5432)},()=>{s.end();process.exit(0)});s.on('error',()=>process.exit(1));setTimeout(()=>process.exit(1),1500);" >/dev/null 2>&1; do
    i=$((i+1))
    if [ "$i" -ge "$max" ]; then
      fail "Postgres did not become ready after ${max}s (DATABASE_URL unreachable)"
    fi
    sleep 1
  done
  log "Postgres is ready"

  log "Running prisma migrate deploy..."
  node ./node_modules/prisma/build/index.js migrate deploy --schema=./prisma/schema.prisma || fail "prisma migrate deploy failed"

  log "Running prisma db seed..."
  node prisma/seed.mjs || fail "database seed failed"
else
  log "DATABASE_URL not set; skipping migrate/seed"
fi

log "Ensuring storage bucket exists..."
node docker/ensure-bucket.mjs || fail "bucket ensure failed"

log "Starting server..."
exec node server.js
