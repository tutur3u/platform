# React 19.2.8

The root dependency overrides pin `react` and `react-dom` to 19.2.8.
A rendering mode belongs to the app's actual build configuration.
React's version alone does not establish RSC support in a deployment.

## Rendering boundaries

Native apps use React through TanStack Start and Router.
Some app configurations also install the start-bridge RSC integration.
The Tools configuration is one such example.
Removing that integration changes which modules execute on the server.

A browser bundle must not import server-only dependencies or contain private bindings.
An SSR render runs outside the browser and cannot read browser storage or DOM APIs.
Hydration requires the initial client render to agree with the server's markup.

Suspense and error boundaries retain their app-specific placement.
Moving a provider or changing a boundary can alter loading, recovery, theme,
localization, and session behavior even when the page still compiles.

## State and effects

TanStack Query remains the repository's client data library.
The owning query key includes the identity and workspace dimensions required by that data.
An app migration must preserve query invalidation and placeholder behavior.

Effects are not a substitute for the app's query layer.
Browser event subscriptions and external-system synchronization have different
lifecycle requirements from a data request.

Sources: [React reference](https://react.dev/reference/react),
[Hydration](https://react.dev/reference/react-dom/client/hydrateRoot),
[Tools RSC configuration](../../../apps/tools/vite.config.mts).
