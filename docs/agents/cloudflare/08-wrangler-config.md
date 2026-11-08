# Wrangler configuration

The checked repository uses Wrangler 4.151.2 in some apps and 4.152.0 in others.
The root declaration is `^4.152.0`.
The owning manifest and lockfile select the executable for an operation.

## Configuration identity

| Field | Meaning to verify |
| --- | --- |
| `name` and account | The intended provider Worker and account. |
| `main` | The actual Worker entrypoint or adapter output. |
| `compatibility_date` and flags | Runtime behavior for this Worker. |
| `assets` | Client output directory, binding, and dispatch behavior. |
| `routes`, `workers_dev`, and `preview_urls` | Which public entrypoints the configuration can expose. |
| Resource and service bindings | Exact resource identities and capabilities. |
| Durable Object migrations | Ordered class and storage history. |
| `limits` and observability | Per-invocation controls and evidence collection. |

Named environments can have distinct binding configuration.
A development binding or successful local simulation does not establish the production binding.
Omitting an identifier is not a universal promise that a tool will safely provision it.

Tools uses its own `VITE_TOOLS_NATIVE_PROFILE` selector inside Void configuration.
A generic environment variable convention must not silently replace that profile mechanism.
`global_fetch_strictly_public` is a runtime compatibility flag, not application authorization.

The repository adopts the `cf` CLI operation by operation.
Wrangler remains available where verified parity is incomplete.
Neither CLI adoption nor a config conversion authorizes a route, DNS, secret, or resource write.

Sources: [Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/),
[Environments](https://developers.cloudflare.com/workers/wrangler/environments/),
[Tooling adoption](../../../apps/docs/build/development-tools/oxc-cloudflare-adoption.mdx).
