# Agent Guidance Review

Use for a requested audit of Tuturuuu instructions or a demonstrated skill-routing
failure. This guide is not a startup requirement for ordinary implementation.

## Where guidance belongs

| Surface | Keep here | Load when |
| --- | --- | --- |
| Root AGENTS.md | Cross-cutting ownership, safety, migration and delivery mandates | Repository work |
| Nearest app AGENTS.md | Local invariants and framework-specific entry points | That app is touched |
| Skill description | Capability and distinguishing trigger | Discovery |
| SKILL.md | Essential decisions, boundaries and relevant reference routes | Capability is needed |
| Reference/script | Conditional procedures, commands and fragile mechanics | That operation is needed |
| Default/task prompt | Requested outcome, constraints and completion evidence | User selects the task |

Inspect canonical sources and symlink targets rather than editing installer caches.
Preserve generated framework blocks and their existing scope explanations. Root
and app rules must still expose hard invariants even if a skill is not selected.
Do not apply generic writing advice to live product AI prompts without evaluating
their tool, authorization, schema, and user-visible behavior contracts.

## Scope and completion

State the outcome instead of a universal itinerary. A missing CLI can need
installation; a finance read with a working CLI does not. A targeted satellite
style fix does not require auditing every auth route. An external-app upload fix
does not authorize adding workspace administration. Keep reliable scripts for
fragile release and migration mechanics.

Carry authorized work through necessary checks and fixes. Specify the actual
external boundary rather than repeatedly asking for permission already given.
Retain production data protections, user-only schema application, Git ownership,
exact-SHA delivery gates, and the requested quiet window. Never interpret silence
as approval to expand scope.

## Evaluate the change

Review realistic requests against the resulting guidance:

| Request | Expected routing and boundary |
| --- | --- |
| Check one finance wallet | Finance read diagnostics; explicit workspace, tiny private read; no install or full tests |
| Create a task from a template | Task/template reference; discover destination, create and verify; no code build |
| Change CLI login | CLI login and affected implementation tests; preserve session/token handling |
| Fix one satellite label | Owning UI and translations; no full shell/auth redesign |
| Debug local auth while another E2E run is active | Own test fixtures; resource admission; never stop the other run |
| Merge after 15 minutes without new activity | Review/check gates and 15-minute watcher; pin head; verify main before sync |
| Main advances during delivery | Inspect range; pinned authorized SHA or approval for added scope |
| Docs typo | Owning document; no unrelated skill stack or deployment |

Run the plugin validator for structural checks and the repository checks required
by changed files. A static routing review is not proof of model behavior. For
complex changes, use an authorized isolated behavioral evaluation with realistic
requests and no live mutations, and report exactly which evidence was collected.
Keep demonstrated improvements; do not add prose quotas or tests matching wording.
