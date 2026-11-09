# OpenNext Cloudflare 1.20.6

`@opennextjs/cloudflare` adapts Next.js output for Workers.
Meet, Parley, and Lettin retain the 1.20.6 tarball in their manifests at the checked commit.
Those configurations describe retained Next compatibility paths.
The satellite migration destination remains native Start with Void and Vite+.

## Adapter boundaries

`open-next.config.ts` and the owning Wrangler configuration determine the adapter's
build output, caching, assets, and Worker bindings.
The app's package scripts determine which build path is being exercised.
An OpenNext build and a native Start build are different artifacts.

OpenNext's support for a Next feature depends on the adapter version and configuration.
Image optimization, caching, middleware, and Node compatibility need their owning
integration checked rather than a blanket supported or unsupported claim.

Existing cache resources, self-reference bindings, service bindings, and Durable
Object migrations remain part of the retained adapter configuration.
Changing their names or identifiers is a provider operation with compatibility effects.

## Migration relationship

A successful native build does not remove the legacy deployment or establish route ownership.
Retained Next files can still be consumed by start-bridge.
Deleting them because the app has a native entrypoint can remove working pages or API handlers.

The [native Start runbook](../../../apps/docs/build/devops/native-start-migration.mdx)
owns the transition between artifacts and live routing.
This reference supplies no automatic deployment, provisioning, or legacy-deletion command.

Sources: [OpenNext Cloudflare](https://opennext.js.org/cloudflare),
[Next.js features](https://opennext.js.org/cloudflare#supported-nextjs-features),
[Meet manifest](../../../apps/meet/package.json),
[Parley manifest](../../../apps/parley/package.json),
[Lettin manifest](../../../apps/lettin/package.json).
