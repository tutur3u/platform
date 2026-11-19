# Contacts

Mobile directory for workspace people. The registered route is `/contacts`.
`/crm` redirects there, and `crm` deep links open the same screen.

The shell title is Contacts. Search is the dock's primary action. Back stays
on the floating dock: this module does not add a Back destination. People,
groups and tags share one segmented control. The audit log is the other dock
destination.

## Web parity

Web behavior lives in the Contacts satellite (`apps/contacts`) and the users
APIs under `packages/internal-api` / `packages/users-core`. This table is the
mobile directory against that surface.

| Capability | Web | Mobile |
| --- | --- | --- |
| People list | Database table with avatar, primary name and a distinct alternate name | Grouped sections. One collapsed name, avatar or initials, one secondary line. A phone number is its own non-wrapping line and is omitted when an email or alternate name is already shown |
| Search | Query on the database route | Shell search, the primary dock action. People search is sent to the API. Groups and tags filter the loaded page |
| Filters | Status, link, attention, group membership, included and excluded groups | Same filters in the filter sheet |
| Groups | Group pages, members, calendar, attendance | Create, edit and delete. Schedule lists the next two weeks of sessions. A session opens attendance for its members |
| Tags | Group-tag list and editor | Create, edit and delete. Colour is one of the four brand marks. Group membership uses the tag group routes. Opening a tag filters people |
| Detail | Profile fields, note, linked platform users, promotions | Permission-redacted fields, note, and linked platform accounts when public info is allowed. Private values stay selectable |
| Create and edit | User form, including archive | Sheet form: name, email, phone, address, note, guest, archive, birthday, avatar |
| Delete | Row action | Action sheet, gated by `delete_users` |
| Duplicates and merge | Detect and merge into a chosen target | Same flow in a sheet |
| Import and export | CSV dialogs | Tools sheet. Export writes a CSV share sheet |
| Audit log | Workspace user audit API | Audit destination with actor, subject, time and field changes |
| Notes | Feedback on a person and group | Feedback sheet, gated by group permissions |
| Permissions | Public info, private info, group view, audit management, create/update/delete | Same permission keys. Missing private permission removes private fields from the row and the detail |
| Overview | Users dashboard | Compact stat row: people, groups, tags, and how many loaded people need attention. It is not the web archived and report counters |
| Reports, approvals, announcements | Full queues | Sections list: report title and stage, pending approvals, announcement title |
| Workspace attendance | Group day grid | Pick a group and mark today, without a session |
| Guest leads | Threshold RPC | Guest people on the loaded database page |
| Tutoring | Tutoring workspace | Upcoming group sessions |
| Metrics | Per-group indicators | Pick a group, then its indicators |
| Structure | Org chart | Group names |
| Workforce | Contracts | Loaded people. Contract fields are not on the contacts API |
| Attendance, reports, approvals, guest leads, tutoring, metrics, structure, topic announcements, workforce | Contacts navigation | Not in this module |

Roles stay on the workspace permission set (`view_users_public_info`,
`view_users_private_info`, `create_users`, `update_users`, `delete_users`,
`view_user_groups`, `manage_workspace_audit_logs`). The directory does not
invent a second role model.
