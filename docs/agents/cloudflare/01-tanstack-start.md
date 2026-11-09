# TanStack Start 1.169.3

`@tanstack/react-start` supplies server functions and the Start Vite plugin.
Its dependency graph resolves additional Start packages at their own versions.
The checked install resolves `start-client-core` 1.170.38, whose server-function builder uses `.validator(...)`.

## Server functions

`createServerFn` creates a callable server boundary.
The validator checks network input before the handler uses it.
A TypeScript annotation or a cast alone does not validate an incoming value.

```ts
import { createServerFn } from '@tanstack/react-start';

export const normalizeLabel = createServerFn({ method: 'POST' })
	.validator((input: unknown) => {
		if (typeof input !== 'string' || input.length > 80) {
			throw new Error('Invalid label');
		}
		return input.trim();
	})
	.handler(({ data }) => ({ label: data }));
```

This example has no protected resource or side effect.
Functions that access workspace data still require the owning server-side authorization.
A route redirect, hidden control, or client-side permission check does not provide that authorization.

`createMiddleware` composes request or function middleware.
The installed declarations determine its builder options and context types.
Existing authentication, origin checks, and request protections remain part of the adapter contract.
Adding a server function does not establish that those protections are installed.

## Request and response APIs

`@tanstack/react-start/server` exports request helpers such as `getRequest`,
`getRequestHeader`, and response helpers such as `setResponseHeaders`.
A `Request` does not itself contain Cloudflare resource bindings.
The owning Worker adapter supplies those bindings.

Server-function return values cross a serialization boundary.
The default strict checks do not make private return fields safe for a client.
Only data intended for the caller belongs in the response.

## Repository integration

`apps/apps/vite.config.mts` uses `tanstackStart(bridge.tanstackStart)`.
`apps/tools/vite.config.mts` also installs the start-bridge RSC plugins.
The app-specific preset supplies aliases, base paths, and client definitions.
Replacing that preset with a generic Start starter loses those app contracts.

Sources: [Server functions](https://tanstack.com/start/latest/docs/framework/react/guide/server-functions),
[Middleware](https://tanstack.com/start/latest/docs/framework/react/guide/middleware),
[Repository bridge](../../../packages/start-bridge).
