# Storage Unzip Proxy

Self-hosted helper service for automatically extracting uploaded ZIP archives back into Tuturuuu Drive.

The proxy only coordinates backend-to-backend extraction. It downloads the
uploaded ZIP from a signed read URL, posts extracted folders/files back to the
web callback route with the shared bearer token, and the web backend writes the
extracted objects to the active workspace storage provider.

## Environment

- `PORT`: HTTP port. Default `8788`.
- `DRIVE_UNZIP_PROXY_SHARED_TOKEN`: Bearer token that must match the workspace secret `DRIVE_AUTO_EXTRACT_PROXY_TOKEN`.
- `DRIVE_UNZIP_PROXY_FETCH_TIMEOUT_MS`: Upstream download/upload timeout. Default `600000` (10 minutes).
- `DRIVE_UNZIP_PROXY_MAX_ARCHIVE_BYTES`: Maximum ZIP download size in bytes. Default `1073741824` (1 GiB).
- `DRIVE_UNZIP_PROXY_MAX_ARCHIVE_ENTRIES`: Maximum number of ZIP entries. Default `2000`.
- `DRIVE_UNZIP_PROXY_MAX_ENTRY_BYTES`: Maximum extracted file size in bytes. Default `1073741824` (1 GiB).
- `DRIVE_UNZIP_PROXY_MAX_TOTAL_EXTRACTED_BYTES`: Maximum total extracted file size in bytes. Default `1073741824` (1 GiB).

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
