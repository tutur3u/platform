# Flat board layout and settings shell

The screenshots render the real shared shell and board-layout components with
synthetic lists in a standalone Vite fixture. They cover 1440 × 900 and 390 × 844,
in light and dark themes. Desktop captures include the sidebar and dialog shell;
mobile navigation captures show the drawer. No account or workspace data is used.

Image sizes: every `after-*` image is a full-viewport headless Chromium capture
(1440 × 900 or 390 × 844). The `after-390-*-navigation` images open the section
drawer with a real click on the mobile selector and show its single highlight on
the current section. `before-1440-*` are 1430 × 900: the browser panel that
captured them dropped the rightmost 10 px of the 1440 px viewport. The before
dialog spans the full viewport, so only that right edge is missing.
`before-390-*` are full 390 × 844 captures.

Before source: `d209d72bfa54e4ed84b50f2a09fdb24e466a0547`.
After source: the accompanying component changes. The desktop dialog has a 32px
inset on all sides; the mobile dialog fills the viewport. The fixture uses system
fonts. It does not establish deployed application or backend mutation acceptance.

The fixture assembles `SatelliteSettingsDialogShell`, `SettingsSection`, and
`BoardLayoutSettingsContent` under QueryClient and English next-intl providers.
Its navigation covers Tasks, Operations, Calendar, Workspace, and Account.
List statuses include Documents, Backlog, Active, Review, Done, and empty Closed.

Browser checks cover desktop search and its empty result, the mobile selector,
keyboard opening of Edit list with all status choices, drag pickup, cross-status
keyboard targeting, and cancellation. Ordering tests cover persistence payloads
for within-status moves, cross-status moves, and empty-status moves. Mutations
against a live backend are outside this fixture.
