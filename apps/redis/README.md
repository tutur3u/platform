# Local Redis Stack (Optional)

This folder wires up a Redis + Serverless Redis HTTP (SRH) stack for local testing. The platform defaults to an in-memory store, so you only start this stack when you want Redis-backed state and Upstash-compatible HTTP access.

## Quick start

```bash
# from apps/redis
bun redis:start
```

The `redis:start` script runs `docker compose up -d`, which launches Redis on port 6379 and SRH on port 8079.

## Configure your app

1. **Point your environment at SRH**

   ```env
   UPSTASH_REDIS_REST_URL=http://localhost:8079
   UPSTASH_REDIS_REST_TOKEN=example_token
   ```

   With this configuration your app uses the local SRH proxy instead of the default local memory store.

2. **Connect to Redis directly (optional)**

   First, find the Redis container name:

   ```bash
   docker compose ps
   ```

   Then connect using `docker exec`:

   ```bash
   docker exec -it <container-name> redis-cli
   ```

   Replace `<container-name>` with the name from `docker compose ps` (typically `redis-redis-1`). From there you can inspect keys, adjust TTLs, and flush state.

## CI and GitHub Actions

Use the same `bun redis:start`/`bun redis:stop` pair in CI jobs if you need a deterministic Redis backend. SRH waits until the first request before dialing Redis, so there is no race condition on startup.

## Tear down

```bash
bun redis:stop
```

This command runs `docker compose down` and removes the containers.

> **Optional reminder:** if you skip running this stack, the app keeps using the in-memory fallback. Running the stack swaps you over to Redis-based storage so your data lives in the containers instead of memory.