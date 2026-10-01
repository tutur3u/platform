# Calendar reminder occurrence timezone

Calendar reminders resolve the authenticated personal timezone, then the reminder
workspace timezone, then the native device identifier. Each workspace uses the
existing Calendar settings repository and cubit precedence. Settings revalidate
on refresh. A transient failure retains the last resolved zone for that same
account and workspace. A cold failure is reported in reminder status and aborts
replanning before notifications are scheduled or cancelled, preserving pending
alerts until settings can resolve. Account changes and logout discard resolved
settings; late prior-scope responses cannot become the current resolution.

Timed events retain their stored UTC start instants. All-day events use the same
projection and legacy UTC date-only compatibility rules as Calendar, then build
09:00 independently in the effective zone. New York 23/25-hour midnight spans use
that zone's local 09:00 rather than their raw UTC fields. Existing fixed-duration
lead offsets and notification IDs remain unchanged. This does not establish a
new persistent all-day identity; ambiguous legacy 24-hour intervals remain under
the existing Calendar contract.

Calendar notification bodies retain the localized lead time and add the actual
occurrence date/time and zone. All-day bodies show the date without the reminder's
09:00 delivery time. Task notification copy retains its existing behavior. Equal
titles are not deduplicated: identity still includes kind, workspace, entity and
offset. Different recurrence rows may legitimately have the same title and
delivery clock.

Focused verification uses `flutter test` on the three reminder planner, copy and
timezone resolver test files. Required validation is `bun check:mobile`, queued
through `ttr resources run --`. These tests do not schedule OS notifications or
access live rows. Native delivery and user recurrence/import identity remain
separate verification tasks.

Workspace discovery retains cached UI snapshots during revalidation. An empty
cached list does not confirm that membership was removed. Reminder cancellation
for an empty membership list requires an awaited, successful server refresh;
failed requests and responses invalidated by cache clearing preserve the
existing reminder ledger until discovery succeeds. Logout still clears it.

Settings timezone resolution is owned by the shared account/workspace scope.
Both root Settings controls show an unknown state until the authenticated
preferences resolve. Account arrival and workspace switches trigger a new scoped
read; late prior-scope results are ignored. Pending reads are bounded to 15 seconds
and failures expose a retry. Same-scope refresh failure retains the last resolved
values. Settings requires a verified native device identifier for the automatic
device fallback; an unavailable plugin is not displayed as verified UTC. A named
personal or workspace preference can resolve without the device. Switching the
last named override to Automatic requires a successful device lookup before the
write; failure preserves the preference. Other existing native timezone fallback
consumers retain their compatibility behavior. These synthetic fixtures do not
establish the cause of an installed-app screenshot or verify native delivery.
