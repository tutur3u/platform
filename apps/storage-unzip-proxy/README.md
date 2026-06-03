# Storage Unzip Proxy

Self-hosted helper service for automatically extracting uploaded ZIP archives back into Tuturuuu Drive.

The proxy only coordinates backend-to-backend extraction. It downloads the
uploaded ZIP from a signed read URL, posts extracted folders back to the web
callback route with the shared bearer token, asks the callback for per-file
upload URLs, and uploads extracted objects only to trusted storage origins.

## Environment

- `PORT`: HTTP port. Default `8788`.
- `DRIVE_UNZIP_PROXY_SHARED_TOKEN`: Bearer token that must match the workspace secret `DRIVE_AUTO_EXTRACT_PROXY_TOKEN`.
- `DRIVE_UNZIP_PROXY_FETCH_TIMEOUT_MS`: Upstream download/upload timeout. Default `600000` (10 minutes).
- `DRIVE_UNZIP_PROXY_MAX_ARCHIVE_BYTES`: Maximum ZIP download size in bytes. Default `104857600` (100 MiB).
- `DRIVE_UNZIP_PROXY_MAX_ARCHIVE_ENTRIES`: Maximum number of ZIP entries. Default `2000`.
- `DRIVE_UNZIP_PROXY_MAX_ENTRY_BYTES`: Maximum extracted file size in bytes. Default `52428800` (50 MiB).
- `DRIVE_UNZIP_PROXY_MAX_TOTAL_EXTRACTED_BYTES`: Maximum total extracted file size in bytes. Default `262144000` (250 MiB).
- `DRIVE_UNZIP_PROXY_ALLOWED_UPLOAD_ORIGINS`: Optional comma-separated exact origins for self-hosted Supabase or custom R2/S3-compatible upload endpoints. Hosted Supabase (`*.supabase.co`) and Cloudflare R2 (`*.r2.cloudflarestorage.com`) upload URLs are allowed by default.
- `DRIVE_UNZIP_PROXY_ALLOW_LOCAL_UPLOAD_ORIGINS`: Set to `true` only for local development when extracted files upload to local Supabase origins such as `http://localhost:8001`.

Keep the archive, per-entry, and total extracted byte defaults conservative unless
the proxy implementation changes to stream safely. The current extractor buffers
the downloaded archive and each extracted file in memory before uploading.
The proxy rejects callback-provided file upload URLs outside trusted storage
origins and forwards only the upload content type plus generated bearer token,
not arbitrary headers from the callback payload.

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
