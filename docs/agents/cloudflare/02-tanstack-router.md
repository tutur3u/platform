# TanStack Router 1.170.45

`@tanstack/react-router` owns route matching, typed navigation, search validation,
loaders, and document-head descriptors for Start apps.

## Route contracts

| API | Responsibility |
| --- | --- |
| `createRouter` | Creates a router with the generated route tree and application context. |
| `createFileRoute` | Defines a file route and its options. |
| `createRootRoute` | Defines the root route. |
| `validateSearch` | Parses untrusted URL search values into the route's search type. |
| `loaderDeps` | Selects search values that affect loader identity. |
| `beforeLoad` | Resolves context or redirects before route loading. |
| `loader` | Loads route data with params, dependencies, and context. |
| `head` | Defines route metadata, links, and scripts. |

`Route.useParams()`, `Route.useSearch()`, and `Route.useLoaderData()` return
values typed by that route. Runtime parsing is still required at external boundaries.

The generated route tree belongs to its generator.
A file route's identifier must agree with that tree.
The app's bridge can generate routes from retained Next files, so ordinary Start
filename conventions are not a reason to move those files by hand.

## Navigation and document rendering

`Link` and `useNavigate` accept typed destinations, params, and search values.
`redirect` and `notFound` represent navigation outcomes from route execution.
The root document uses `HeadContent` and `Scripts` for its SSR head and scripts.
Existing providers, theme controls, localization, and document structure remain app-specific.

`router.invalidate()` invalidates Router data.
It does not invalidate a CDN, application cache, or database cache.
A mutation may also need TanStack Query invalidation under the owning query keys.

A `beforeLoad` redirect improves navigation but does not authorize a separate
server function, API handler, or resource request.

Sources: [Overview](https://tanstack.com/router/latest/docs/framework/react/overview),
[Search params](https://tanstack.com/router/latest/docs/framework/react/guide/search-params),
[Data loading](https://tanstack.com/router/latest/docs/framework/react/guide/data-loading),
[Document head](https://tanstack.com/router/latest/docs/framework/react/guide/document-head-management).
