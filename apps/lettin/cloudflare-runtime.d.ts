// Keep Cloudflare binding types without replacing Next's DOM fetch globals.
type D1Database = import('@cloudflare/workers-types').D1Database;
type R2Bucket = import('@cloudflare/workers-types').R2Bucket;
type Fetcher = import('@cloudflare/workers-types').Fetcher;
type WorkerVersionMetadata =
  import('@cloudflare/workers-types').WorkerVersionMetadata;
