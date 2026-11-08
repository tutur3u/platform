# Next.js 16.4.2 migration map

`apps/web` remains on Next.js.
Satellite migration preserves behavior through `@tuturuuu/start-bridge` before
replacing individual framework dependencies.
This table identifies the boundary to inspect. It is not a global replacement script.

| Next concept | Start or Worker boundary | Contract to preserve |
| --- | --- | --- |
| App routes and layouts | Generated bridge routes or native Router routes | Providers, locale, base path, error boundaries, and API dispatch. |
| `next/navigation` and `next/link` | Existing bridge adapter or typed Router navigation | Redirects, search state, history, and document-navigation mode. |
| `next/headers` | Bridge request context or Start server request helpers | Request identity, cookie attributes, and response headers. |
| Route handlers | Owning Worker dispatch or Start server routes | Methods, paths, status codes, authorization, and response shape. |
| Server actions | Retained bridge behavior or an explicit server function | Input validation, authorization, origin protections, and serialization. |
| `revalidatePath` and `revalidateTag` | Owning application cache policy | Cache scope and privacy. Router invalidation is only Router data. |
| `next/image` | Owning media component and provider configuration | Signed access, dimensions, caching, optimization, and remote-source policy. |
| `next-intl` | Existing bridge alias or an explicit localization adapter | Message lookup, locale routes, formatting, and server context. |
| React Server Components | Start-bridge RSC integration where present | Server-only imports, module boundaries, and streamed rendering. |

Next route-segment cache settings are not portable Worker controls.
The checked Next apps enable Cache Components, so their existing request-time
rendering rules still apply while the Next path is retained.

A framework migration does not change an app's data ownership or permissions.
First-party callers and their tests determine which behavior must survive each adapter change.

Sources: [Next.js documentation](https://nextjs.org/docs),
[Start bridge](../../../packages/start-bridge),
[Native Start runbook](../../../apps/docs/build/devops/native-start-migration.mdx).
