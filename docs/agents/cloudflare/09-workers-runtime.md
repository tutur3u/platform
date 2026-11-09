# Workers runtime limits

These values describe Cloudflare's published Workers limits checked on 9 November 2026.
They are provider limits, not a guarantee for a particular account or invocation.
The [limits page](https://developers.cloudflare.com/workers/platform/limits/) owns plan-specific details and exceptions.

| Limit | Published value |
| --- | --- |
| Memory | 128 MB per isolate, shared by its concurrent requests. |
| HTTP CPU, Free | 10 ms. |
| HTTP CPU, Paid | 30 seconds by default, configurable up to 5 minutes. |
| Subrequests | 50 per request on Free; 10,000 by default on Paid. |
| Simultaneous outgoing connections | 6 per request while awaiting response headers. |
| Variables | 64 on Free, 128 on Paid; 5 KB per variable. |
| Uncompressed Worker size | 64 MiB. Upload and other platform limits still apply. |
| Startup | 1 second. |

CPU time differs from wall time. Waiting on network I/O does not consume CPU time.
HTTP execution depends on the client connection; Cron, queue, and alarm duration rules differ.
`waitUntil` is bounded and is not a durable background-job guarantee.
Per-invocation limits do not cap total billable work across invocations.

## Node compatibility and environment values

The [Node compatibility guide](https://developers.cloudflare.com/workers/runtime-apis/nodejs/)
states that `nodejs_compat` and v2 are enabled by default for compatibility dates
on or after 2026-08-04. Older dates require the documented flags.
A compatibility-date change can alter behavior and is not a formatting update.

With Node compatibility and `nodejs_compat_populate_process_env`, `process.env` can
contain configured vars, secrets, and version metadata. The population flag defaults
on for compatibility dates on or after 2025-04-01.
`process.env` is mutable and coerces assigned values to strings.
Wrangler or the Cloudflare Vite plugin can replace `process.env.NODE_ENV` at build time.

Resource bindings come through the Worker handler's `env` or `cloudflare:workers`.
Replacing the entire `process.env` object with `env` is unsafe.
A resource object is not a string environment variable.

The compatibility layer is not a complete Node operating system.
Local filesystem state is not durable application storage.
Runtime imports stay in framework or provider adapters, outside portable domain modules.

Source: [Workers process API](https://developers.cloudflare.com/workers/runtime-apis/nodejs/process/).
