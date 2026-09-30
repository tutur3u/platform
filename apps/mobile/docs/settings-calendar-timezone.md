# Settings, ordering, Profile, and Calendar timezone behavior

Settings reuses the existing theme (including system), language (system, English,
Vietnamese), calendar, finance, navigation, and haptics sources. Personal timezone
is persisted through authenticated Calendar settings. Workspace timezone appears beside personal timezone on the main Settings
page and requires workspace settings permission; hiding an editor is not server authorization. The authenticated Calendar and Infrastructure API routes are a separate
integration dependency. Permission checks clear immediately on account/workspace
changes, ignore stale responses, and revalidate on pull-to-refresh. Workspace
admin pages keep their other controls; the old Preferences URL redirects to the
main Settings page. Open-source licenses is directly accessible there.

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

## Verification evidence

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
