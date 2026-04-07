# Storage Unzip Proxy

Self-hosted helper service for automatically extracting uploaded ZIP archives back into Tuturuuu Drive.

## Environment

- `PORT`: HTTP port. Default `8788`.
- `DRIVE_UNZIP_PROXY_SHARED_TOKEN`: Bearer token that must match the workspace secret `DRIVE_AUTO_EXTRACT_PROXY_TOKEN`.

## Run locally

```bash
bun install
bun run src/server.js
```

## Docker

```bash
docker build -t storage-unzip-proxy .
docker run --rm -p 8788:8788 \
  -e DRIVE_UNZIP_PROXY_SHARED_TOKEN=change-me \
  storage-unzip-proxy
```
