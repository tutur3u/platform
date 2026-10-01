# Settings, ordering, Profile, and Calendar timezone behavior

The App, Workspace, and You dock destinations consolidate into one Settings
screen. Workspace and You are nested navigation rows; App preferences are compact
items on that root. Preferences, General, and Support use quiet grouped surfaces
and current-value summaries. Expanded preferences retain two grouped columns
at widths of at least 840dp.
Theme, language, first day, timezone, Finance visibility, haptics, and default
Task board behavior open nested adaptive choice editors. Root rows do not contain
switches and tapping, opening, canceling, dismissing, or returning from an editor
never changes a preference. An explicit choice is required. Editors cancel on an
account/workspace switch, including switching away and back before selecting.

Settings reuses the existing preference sources. Workspace timezone remains next
to personal timezone and requires workspace settings permission; hiding an editor
is not server authorization. Loading, unknown, retry, and retained same-scope
failure states remain visible. Permission checks clear immediately on scope
changes, ignore stale responses, and revalidate on pull-to-refresh. Workspace
administration retains its guarded detail routes. You opens the existing Profile;
Session, About, and the bundled license viewer remain reachable. Home/Apps and
Profile's app-wide navigation stay in the existing shell. Workspace is now a
Settings child, so its Back returns to Settings; deeper routes return to their
parent. Existing URLs and the legacy Preferences redirect remain valid.

This replaces the earlier decision to expose root switches. The default is a
compact row with a concise label, muted summary, chevron, and at least a 48dp touch
target; full explanations and options belong in the child. Rows grow with large
text. Contextual Time Tracker, Mail, Meet, and Assistant editors remain in their
owning app because their context and permission rules differ.

Calendar resolves personal timezone, then workspace timezone, then device
timezone. Stored event times remain UTC instants. Views explicitly project them
into the effective IANA zone; calendar dates use deliberate date carriers rather
than device-local midnight arithmetic. Forms serialize each boundary independently,
reject nonexistent DST wall times, and preserve unchanged UTC instants, including
an existing later occurrence of an overlapping wall time. All-day UI end dates are
inclusive; saved interval ends are exclusive midnights, including 23/25-hour days.
Legacy all-day interpretation remains ambiguous. There is no new persistent
all-day identity or metadata payload in this stage: the shared backend contract is
pending, and existing scheduling metadata remains intact.

On an account/workspace switch, a mounted Calendar clears its earlier zone while the new preferences are unresolved, including a failed load. A same-scope
refresh retains its resolved zone, including refresh failure. This prevents a prior
account or workspace preference from becoming the new scope's indefinite fallback.
An explicit calendar-date selection remains stable during this reset, including
before events have first loaded.

Home and Apps share the adaptive order-editor sheet. App ordering consumes a tile
margin tap without launching an app, and a true inter-cell gap exits ordering.
Visibility and experimental-app access still use their original state and guards.
Open-source licenses opens Flutter's bundled LicensePage. Profile uses separate
Overview and Timeline segments. Timeline entries come from the existing scoped
activity repository, render newest first, and retain existing destinations.
Calendar timeline rows are explicitly workspace activity; they do not claim the
signed-in user created the event.

## Compact Settings verification (2026-10-01)

The compact stage mounts the real ShellPage, SettingsPage, workspace child and
adaptive editors with synthetic authenticated scope and preference fixtures. The
initial bounded serial focused run passed 69 tests across compact navigation, motion,
workspace timezone permissions, actual timezone selection and shell Back. Focused
analysis covers the changed runtime files and new harness. Dart formatting and
`git diff --check` pass. Dependency metadata reuses the compatible existing mobile
workspace without installing packages or creating a dependency tree.

Coverage includes one Settings dock item; Workspace row and Back; root rows with
no switches; explicit choices versus cancel/dismiss; account/workspace switches
away and back; timezone loading/unknown/retry and permissions; legacy Preferences
redirect; license Back; and 320×568 layouts at 1×/2× text including a 280px keyboard.
The timezone editor uses one bounded sliver viewport in the existing dialog
scaffold. Its heading and search scroll with lazily built choices, keeping options
reachable at large text with the keyboard open without laying out every zone.
Editor scroll notifications stay inside the modal so they do not hide the
underlying shell dock.
The default scaffold layout for other callers is unchanged.

Rendered proof uses populated synthetic fixtures, the application themes and
bundled/SDK fonts. It is widget-render evidence, not native/device or screen-reader
proof. No customer preferences were written. Exact-head owning Mobile Analysis,
test shards and native development build CI remain required; no local native build
or full repository check ran for this compact stage.

The review correction checkpoint passes all 15 compact navigation cases and
focused 12-item analysis. It verifies lazy zone choices (fewer than 30 built tiles
with an empty query), filtered off-screen choices, expanded grouped columns,
keyboard reachability and explicit save, and modal scroll isolation. Actual root
scroll metrics are 0–5335px: a drag moves 0→150→75px, remaining in bounds while
hiding and revealing the dock. No timer-drain teardown workaround is used.
Earlier failed harness and lint runs are retained separately; exact-head owning CI
and native/device checks remain pending.

## Earlier verification evidence

The timezone stage is local commit `74dc63166f`. Its required queued
`bun check:mobile` passed 1,095 tests; the subsequently added actual timezone chooser
search/save regression passed separately. Before follow-up gesture coverage, the
UI stage passed 11 focused tests and all 1,099 tests in `bun check:mobile`, plus
analysis, Dart formatting, and iOS project settings. The follow-up Apps/timeline
focused set passed 7 tests, and the final queued checkpoint gate passed all 1,100
tests with analysis, formatting, and iOS project settings passing. The separate
scope-fallback fix passed 9 focused cases and the exact final required gate passed
all 1,105 tests with analysis, formatting, and iOS project settings passing.

Focused widget coverage includes actual license navigation, chronological
uncollapsed timeline entries, Settings control/motion rendering, margin and true-gap
taps without app launch, the next normal tap selecting the app, a short hold below
the drag delay, ordinary scroll cancellation, basic app button semantics, and the
existing long-hold/reflow/drop order persistence test. This is not comprehensive
gesture or accessibility verification.

Still missing: exact 280ms boundary/slop timing across native platforms, pointer
jitter and cancellation fuzzing, RTL/text-scale gap cases, edge auto-scroll while
dragging, assistive reorder actions/keyboard navigation, and Android system-back
and dock-back integration for the order/license surfaces.

The actual supplied `IMG_6274.png` and `IMG_6275.png` references were materialized
with the Library consumer-local workflow and visually inspected. They show Home's
sheet and Apps' previous inline editor. No post-change native/device screenshot,
native build, live preference/event mutation, store release, push, or main merge
was performed. English/Vietnamese UI strings remain in the existing ARB files and
generated localization sources.

## Contextual mini-app preferences

The main page reuses theme/system, language, finance visibility, calendar first
day, haptics, navigation, and timezone state. Notification/reminder and cache
controls retain their existing detailed surfaces. Complex workspace administration
remains linked with its existing permission checks.

Pomodoro settings remain with the active TimeTrackerCubit; their legacy device
preference key is not migrated here. Time tracking approval thresholds require
request-management and workspace-settings permissions. Assistant live browsing
uses scoped persistence plus the active page connection lifecycle. Mail settings
require mailbox context; swipe gestures use the existing device preference
notifier. Meet settings are active-room policies. Duplicating these editors on
the root page would introduce competing state, so this stage retains their
contextual editors. A broader consolidation needs shared owners or dedicated
existing routes before those controls can safely move.
