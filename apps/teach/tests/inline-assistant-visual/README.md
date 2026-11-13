# Module assistant visual fixture

This local harness renders the actual `ModuleContentEditor`, shared rich-text
editor and inline assistant. Saving and AI responses use synthetic local data;
no authentication, production data or remote provider is required. The review
fixture runs through the internal API helper with an injected streaming fetch.
It does not validate live model quality or production-session behavior.

After `bun install` and the Teach production build, run from the repository root:

```sh
bunx --no-install vite --config apps/teach/tests/inline-assistant-visual/vite.config.mts
```

Open `http://127.0.0.1:7897/?locale=en&theme=light`. Supported query values are
`en` / `vi` and `light` / `dark`. The fixture serves CSS from Teach's generated
`.next/static/chunks` output so screenshots use production styling. Select a help
level and choose Review draft. Check 390px and 1440px widths, both locales and
themes, accept/dismiss, off/hints/full, and a reduced-motion browser preference.
Alt+Shift+A moves keyboard focus from the editor to the assistant panel.

The server binds loopback only. Stop it after capture. Never expose this harness
as a production route or replace production access/credit checks with fixture code.
