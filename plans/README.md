# Continuous Improvement Audit Index

Audit snapshot: `44742d2cedda465fa16cfbae8d6a234563cc39f6` on 2026-08-12.

These began as advisor plans. Original reviewed commits remain as provenance in
`DONE` rows; every DONE implementation is integrated in verified main
`b68f9f182d`. Retained uncommitted implementations and external
dependencies are recorded in `BLOCKED` rows. Before resuming any plan, re-read
the nearest `AGENTS.md`, load the named Tuturuuu skills, and compare its evidence
with the current branch. If the relevant code has drifted, update the plan
before editing source.

## Recommended execution order

| Order | Plan | Priority | Effort | Risk | Status | Dependencies |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | [Fail Closed on Task Embedding Webhook Authentication](./006-fail-closed-task-embedding-webhook.md) | P0 | S | Low | DONE | reviewed commit `af350bc28c` on `fix/task-embedding-webhook-auth` |
| 2 | [Minimize View-Only Shared-Task Responses](./034-minimize-view-only-shared-task-responses.md) | P0 | M | Medium | DONE | reviewed commit `b7fefde4db` on `fix/shared-task-response-scope` |
| 3 | [Bind Meet Poll Mutations to Authorized Actors](./045-bind-meet-poll-mutations-to-authorized-actors.md) | P0 | M | Medium | DONE | reviewed commit `5989eec413` on `fix/meet-poll-actor-authorization` |
| 4 | [Authorize Teach Course Module Reordering](./047-authorize-teach-course-module-reordering.md) | P0 | S | Low | DONE | reviewed commit `5c7225de1f` on `fix/teach-course-module-order-permission` |
| 5 | [Authorize User Group Tag Operations](./052-authorize-user-group-tag-operations.md) | P0 | M | Medium | DONE | reviewed commit `b6cfc860a4` on `fix/user-group-tag-authorization` |
| 6 | [Restrict Cross-User Time-Tracking Reads](./055-restrict-cross-user-time-tracking-reads.md) | P0 | S | Medium | DONE | reviewed commit `892cd92d78` on `fix/track-cross-user-read-permission` |
| 7 | [Require Score-Update Permission for Group Indicators](./067-require-score-update-permission-for-group-indicators.md) | P0 | S | Low | DONE | reviewed commit `7b0164b016` on `fix/group-indicator-score-permission` |
| 8 | [Gate Nova Challenge and Problem Catalogs by Eligibility](./090-gate-nova-challenge-problem-catalogs.md) | P0 | M | Medium | DONE | reviewed commit `ce6a148ac8` on `fix/nova-catalog-eligibility` |
| 9 | [Bind Track Comment Mutations to the Route Workspace](./113-bind-track-comments-to-route-workspace.md) | P0 | S | Low | DONE | reviewed commit `b086d9eec7` on `fix/track-comment-workspace-boundary` |
| 10 | [Prevent Unauthorized Git Validation-State Mutations](./126-prevent-unauthorized-git-validation-mutations.md) | P0 | S | Low | DONE | reviewed commit `d1831f9435` on `fix/git-validation-auth-control-flow` |
| 11 | [Restrict Nova OG Avatar Origins Before Server Rendering](./127-restrict-nova-og-avatar-origins.md) | P0 | M | Medium | DONE | reviewed commit `eae551967d` on `fix/nova-og-avatar-origin` |
| 12 | [Stop Logging Discord Token Prefixes](./060-stop-logging-discord-token-prefixes.md) | P0 | S | Low | DONE | reviewed commit `510c4c9dff` on `fix/discord-token-log-safety`; rotation remains operator-required |
| 13 | [Make Hive Mind Simulation Materialization Atomic](./110-make-hive-mind-simulation-atomic.md) | P1 | M | Medium | DONE | reviewed commit `c8d88a1ecc` on `fix/hive-mind-materialization` |
| 14 | [Cover Feedback Mutation Authorization](./063-cover-feedback-mutation-authorization.md) | P1 | M | Low | DONE | reviewed commit `81a835b4ec` on `chore/feedback-mutation-authorization` |
| 15 | [Preserve Track Request Images on Failed Edits](./044-preserve-track-request-images-on-failed-edits.md) | P1 | M | Medium | DONE | reviewed commit `1adc88a201` on `fix/track-request-image-edit-order` |
| 16 | [Handle Asynchronous CLI Browser Launch Failures](./023-handle-cli-browser-launch-errors.md) | P1 | S | Low | DONE | reviewed commit `863b00e1e3` on `fix/cli-browser-launch-errors` |
| 17 | [Bound Meeting Transcription Input Before AI Invocation](./016-bound-meeting-transcription-input.md) | P1 | S | Low | DONE | reviewed commit `5be1e5bcbf` on `fix/meeting-transcription-input-bounds` |
| 18 | [Discover Every Repository Script Test](./004-discover-all-script-tests.md) | P1 | S | Low | DONE | reviewed commit `558397b971` on `fix/discover-script-tests` |
| 19 | [Repair UI Time-Tracker Exports](./049-repair-ui-time-tracker-exports.md) | P1 | S | Low | DONE | reviewed commit `b1b7c71fef` on `fix/ui-time-tracker-exports` |
| 20 | [Restore Timeblock State Tests and Fix Single-Cell Removal](./080-restore-timeblock-state-machine-tests.md) | P1 | M | Medium | DONE | reviewed commit `d66675d9d6` on `fix/timeblock-state-machine-removal` |
| 21 | [Bound and Authorize the Nova Submission Directory](./088-bound-nova-submission-user-search.md) | P1 | M | Medium | DONE | reviewed commit `c4a75248aa` on `perf/bound-nova-submission-search` |
| 22 | [Make the Public UI Quickstart Executable](./123-make-public-ui-quickstart-executable.md) | P1 | S | Low | DONE | reviewed commit `1ed1e5c243` on `docs/ui-public-quickstart` |
| 23 | [Characterize the Storage Unzip Extraction Boundary](./125-characterize-storage-unzip-extraction-boundary.md) | P1 | M | Low | DONE | reviewed commit `7e86d05782` on `chore/storage-unzip-extraction-tests` |
| 24 | [Audit Coordination Notes Against the Canonical Lifecycle](./122-audit-coordination-note-lifecycle.md) | P1 | M | Low | DONE | reviewed commit `857139df10` on `chore/coordination-note-audit` |
| 25 | [Evict Empty Hive Realtime Rooms](./024-evict-empty-hive-realtime-rooms.md) | P2 | S | Low | DONE | reviewed commit `91ae384722` on `fix/hive-realtime-room-eviction` |
| 26 | [Correct Learn and Teach Ownership Documentation](./018-correct-learn-teach-ownership-docs.md) | P2 | S | Low | DONE | reviewed commit `14e0f81006` on `docs/education-satellite-ownership` |
| 27 | [Single-Source Calendar Preference Resolution](./120-single-source-calendar-preference-resolution.md) | P2 | S | Low | DONE | reviewed commit `b53b925a2a` on `refactor/calendar-preference-resolver` |
| 28 | [Correct Satellite API Ownership Documentation After Hard Cutovers](./131-correct-satellite-api-ownership-docs.md) | P2 | M | Low | DONE | reviewed commit `27fd7f13bd` on `docs/satellite-api-ownership` |
| 29 | [Enforce the Source-Size Ceiling with a Changed-File Ratchet](./144-enforce-source-size-ratchet.md) | P1 | M | Medium | DONE | reviewed commit `fea9163854` on `chore/enforce-source-size-ratchet` |
| 30 | [Correct Local Supabase Authorization Recipes](./152-correct-local-supabase-authorization-recipes.md) | P1 | M | Low | DONE | reviewed commit `f2c74af4b2` on `docs/fix-local-supabase-recipes` |
| 31 | [Isolate Supabase Validation per Exact-Base Worktree](./151-isolate-supabase-validation-per-worktree.md) | P1 | L | Medium | DONE | reviewed commit `132a9e3ebb` on `chore/isolate-supabase-validation` |
| 32 | [Authorize Task Relationship Mutations](./150-authorize-task-relationship-mutations.md) | P0 | M | Medium | BLOCKED | full isolated pgTAP failed twice on five unrelated exact-base suites; focused implementation retained |
| 33 | [Require Project Permission for Task Links](./145-require-project-permission-for-task-links.md) | P0 | M | Medium | BLOCKED | replay retained worktree atop Plan 151; full exact-base pgTAP baseline remains red |
| 34 | [Bind Track Request References to One Workspace](./149-bind-track-request-references-to-workspace.md) | P0 | L | High | BLOCKED | time-tracking coordination plus migration/generated-type ownership transfer |
| 35 | [Bind Task Project-Update Interactions to the Route Workspace](./141-bind-task-project-update-interactions.md) | P0 | M | Medium | BLOCKED | Tasks typecheck failed twice; 38-test implementation retained |
| 36 | [Retire Dormant Calendar Settings State and Localize the Live Surface](./136-retire-dormant-calendar-settings-state.md) | P2 | M | Low | BLOCKED | Calendar Turbopack process/port `EPERM`; reviewed worktree retained |
| 37 | [Honor Task Workspace Membership Results](./138-honor-task-workspace-membership-result.md) | P0 | S | Low | BLOCKED | Tasks Turbopack process/port `EPERM`; reviewed worktree retained |
| 38 | [Put Teach Module Mutations Behind the Education Boundary](./137-secure-teach-module-mutations.md) | P0 | M | Medium | BLOCKED | education-extraction ownership note archival or exact-path transfer |
| 39 | [Bind Linked Products to One Workspace](./139-bind-inventory-linked-products-to-workspace.md) | P0 | L | Medium | BLOCKED | Contacts/users-core, Finance/Inventory, and generated migration/type ownership transfer |
| 40 | [Require Member-Management Permission for Batch Invitations](./132-authorize-workspace-batch-invitations.md) | P0 | S | Low | BLOCKED | member-invite satellite-auth and G22 migration-artifact ownership transfer |
| 41 | [Bind Recurring Transactions to Wallets and Categories in the Route Workspace](./128-bind-recurring-transactions-to-route-workspace.md) | P0 | M | Medium | BLOCKED | Finance/Inventory application and generated migration/type ownership transfer |
| 42 | [Retire the Unauthorized Calendar Active-Sync Path](./031-retire-unauthorized-calendar-active-sync.md) | P0 | M | Medium | BLOCKED | Calendar Turbopack process/port `EPERM`; reviewed worktree retained |
| 43 | [Authorize and Meter Teach Object Generation](./025-authorize-and-meter-teach-object-generation.md) | P0 | M | Medium | BLOCKED | Teach Turbopack process/port `EPERM`; reviewed worktree retained |
| 44 | [Bind Rewise AI Work to the Selected Workspace](./026-bind-rewise-ai-work-to-selected-workspace.md) | P0 | M | High | BLOCKED | Rewise Turbopack process/port `EPERM`; reviewed worktree retained |
| 45 | [Enforce Calendar Event Permission End to End](./086-enforce-calendar-event-permission.md) | P0 | M | Medium | BLOCKED | replay retained worktree atop Plan 151; full exact-base pgTAP baseline remains red |
| 46 | [Enforce Calendar Category Permission End to End](./105-enforce-calendar-category-permission.md) | P0 | M | Medium | BLOCKED | Plan 086 must be DONE; its reviewed worktree is database-gate blocked |
| 47 | [Enforce the Calendar Provider-Sync Boundary](./115-enforce-calendar-provider-sync-boundary.md) | P0 | M | Medium | BLOCKED | Plans 031 and 086 must be DONE; both reviewed worktrees are blocked |
| 48 | [Bind AI Chat Files to Authorized Chat Actors](./035-bind-ai-chat-files-to-authorized-chat-actors.md) | P0 | M | Medium | BLOCKED | G22 route-artifact ownership transfer |
| 49 | [Require Confirmation for Hive Browser-State Recovery](./042-require-confirmation-for-hive-browser-recovery.md) | P0 | S | Low | BLOCKED | mandatory Hive build hits environment-only Turbopack process/port `EPERM`; reviewed worktree retained |
| 50 | [Bind Calendar OAuth State to the Initiating Actor](./030-bind-calendar-oauth-state-to-initiating-actor.md) | P0 | M | Medium | BLOCKED | Mail/Zalo generated database type ownership transfer |
| 51 | [Enforce Tulearn Learner Identity Pairing](./032-enforce-tulearn-learner-identity-pairing.md) | P0 | M | Medium | BLOCKED | Mail/Zalo generated database type ownership transfer |
| 52 | [Require Tulearn Course Assignment for Test Sessions](./036-require-tulearn-test-course-assignment.md) | P0 | M | Medium | BLOCKED | Plan 032 must be DONE; generated database type ownership transfer |
| 53 | [Authorize and Meter Spark Year-Plan Generation](./033-authorize-and-meter-spark-year-plan-generation.md) | P0 | M | Medium | BLOCKED | G22 route-artifact ownership transfer |
| 54 | [Enforce the Devbox Container Boundary](./020-enforce-devbox-container-boundary.md) | P0 | L | High | BLOCKED | G22 route-artifact and backend migration ownership transfer; refresh stale Web-only parity scope before execution |
| 55 | [Require Nova Role-Management Authorization](./013-require-nova-role-management-authorization.md) | P0 | S | Low | BLOCKED | mandatory Nova build hits environment-only Turbopack process/port `EPERM`; reviewed worktree retained |
| 56 | [Enforce Nova Submission Authorization and Grading Integrity](./012-enforce-nova-submission-authorization.md) | P0 | M | Medium | BLOCKED | Plan 013 must be DONE; its reviewed worktree is build-blocked |
| 57 | [Bind Nova Sessions to Authorized Actors](./014-bind-nova-sessions-to-authorized-actors.md) | P0 | S | Medium | BLOCKED | Plan 013 must be DONE; its reviewed worktree is build-blocked |
| 58 | [Restrict Short Links to HTTP and HTTPS Destinations](./015-restrict-short-links-to-http-destinations.md) | P0 | S | Low | BLOCKED | G22 route-artifact ownership transfer |
| 59 | [Authorize Global IP Denylist Operations](./017-authorize-global-ip-denylist-mutations.md) | P0 | S | Medium | BLOCKED | Turbopack cannot create its CSS worker process/internal port in the current environment; implementation and passing non-build gates are preserved in `.worktrees/fix-infrastructure-blocked-ip-auth` |
| 60 | [Require Project Permission for Task Planning Mutations](./046-require-project-permission-for-task-planning-mutations.md) | P0 | M | Medium | BLOCKED | Mail/Zalo generated database type ownership transfer |
| 61 | [Enforce Task-Progress Object Ownership](./057-enforce-task-progress-object-ownership.md) | P0 | M | Medium | BLOCKED | Mail/Zalo generated database type ownership transfer |
| 62 | [Enforce Suspension Across Every Session-Auth Path](./118-enforce-suspension-across-session-auth.md) | P0 | L | High | BLOCKED | Forms/Web, Tasks, and Inventory auth ownership transfer |
| 63 | [Bind External Chat Context to Conversation Participants](./104-bind-external-chat-context-to-participants.md) | P0 | S | Medium | BLOCKED | G22 route-artifact ownership transfer |
| 64 | [Reconcile Provider Checkout Creation Before Releasing Inventory](./106-reconcile-provider-checkout-creation.md) | P0 | L | High | BLOCKED | Finance/Inventory migration and generated-type ownership transfer |
| 65 | [Reserve External-Project Email Budget Atomically](./109-reserve-external-project-email-budget.md) | P0 | M | Medium | BLOCKED | Richfield external-project, G22 route-artifact, and generated migration/type ownership transfer |
| 66 | [Make CMS Binding Revocation Atomic and Fail Closed](./100-make-cms-binding-revocation-atomic.md) | P0 | M | High | BLOCKED | Richfield external-CMS and generated-type ownership transfer |
| 67 | [Retire the Wallet Migration Writer](./087-retire-wallet-migration-writer.md) | P0 | S | Medium | BLOCKED | Finance/Inventory migration owner releasing or transferring the exact route |
| 68 | [Allowlist Workspace Secret Mutations](./092-allowlist-workspace-secret-mutations.md) | P0 | S | Medium | BLOCKED | G22 migration-artifact ownership transfer |
| 69 | [Enforce Nova Session Admission Atomically](./091-enforce-nova-session-admission.md) | P0 | L | High | BLOCKED | Plan 014; generated database type ownership transfer |
| 70 | [Constrain Group Post Recipients](./081-constrain-group-post-recipients.md) | P0 | M | Medium | BLOCKED | daily-report queue ownership and G22 migration-artifact ownership transfer |
| 71 | [Authorize Board Template Publication](./082-authorize-board-template-publication.md) | P0 | M | Medium | BLOCKED | Tasks production/release ownership transfer |
| 72 | [Enforce Task Board Edit Access](./076-enforce-task-board-edit-access.md) | P0 | M | Medium | BLOCKED | Tasks production/release ownership transfer |
| 73 | [Fail Closed When Supermemory Authentication Is Unconfigured](./064-fail-closed-supermemory-authentication.md) | P0 | S | Low | BLOCKED | native CI/cache Compose ownership release |
| 74 | [Bind Meeting Recording Mutations to the Route Workspace](./066-bind-meeting-recordings-to-route-workspace.md) | P0 | M | Medium | BLOCKED | G22 route/migration artifacts ownership release |
| 75 | [Move Mira Rewards Behind Verified Events](./061-move-mira-rewards-behind-verified-events.md) | P0 | L | High | BLOCKED | G22 generated migration-artifact ownership release |
| 76 | [Make Account Deletion Resumable](./062-make-account-deletion-resumable.md) | P0 | L | High | BLOCKED | G22 generated migration-artifact ownership release |
| 77 | [Bind Vocabulary to Learner Course Access](./056-bind-vocabulary-to-learner-course-access.md) | P0 | M | Medium | BLOCKED | Plan 032; education extraction ownership release |
| 78 | [Authorize Workspace AI Prompt Mutations](./050-authorize-workspace-ai-prompt-mutations.md) | P0 | M | Medium | BLOCKED | G22 route-artifact ownership release or explicit transfer |
| 79 | [Bind Meet Plan Creation to Workspace Members](./051-bind-meet-plan-creation-to-workspace-members.md) | P0 | S | Medium | BLOCKED | G22 route-artifact ownership release or explicit transfer |
| 80 | [Allowlist Workspace Document Updates](./040-allowlist-workspace-document-updates.md) | P0 | S | Low | BLOCKED | G22 backend migration ownership release or explicit transfer |
| 81 | [Enforce Profile-Link Submission Limits Atomically](./041-enforce-profile-link-submission-limits-atomically.md) | P0 | M | Medium | BLOCKED | G22 backend migration ownership release or explicit transfer |
| 82 | [Redact Internal Failures from Public Forms Responses](./114-redact-public-forms-internal-errors.md) | P0 | S | Low | BLOCKED | Forms satellite ownership transfer |
| 83 | [Enforce SES Webhook and Inbound Object Authenticity](./009-enforce-ses-webhook-and-object-authenticity.md) | P0 | M | Medium | BLOCKED | Mail catch-all handoff owns app/docs |
| 84 | [Paginate Workspace Datasets Consistently](./153-paginate-workspace-datasets-consistently.md) | P1 | M | Medium | BLOCKED | backend, G22 route-manifest, and internal-api ownership transfer |
| 85 | [Cap Finance Transaction Pages Before Enrichment](./140-cap-finance-transaction-page-size.md) | P1 | S | Low | BLOCKED | Finance application ownership transfer |
| 86 | [Aggregate CMS Commerce Metrics in the Database](./129-aggregate-cms-commerce-metrics.md) | P1 | M | Medium | BLOCKED | CMS, Richfield, Finance/Inventory, and generated-type ownership transfer |
| 87 | [Paginate CMS Commerce Products and Storefront Listings](./130-paginate-cms-commerce-catalogs.md) | P1 | L | Medium | BLOCKED | CMS, Richfield, Finance/Inventory, internal-api, and generated-type ownership transfer |
| 88 | [Enroll Chat and Meet Realtime in Canonical Verification](./133-enroll-chat-meet-realtime-verification.md) | P1 | M | Low | BLOCKED | Mail-owned `bun.lock` transfer |
| 89 | [Bound Chat and Meet Realtime Lifecycle State](./134-bound-chat-meet-realtime-lifecycle.md) | P1 | M | Medium | BLOCKED | Plan 133 |
| 90 | [Bound Inventory Polar Sync-Health Responses](./135-bound-inventory-polar-sync-health.md) | P1 | M | Medium | BLOCKED | Finance/Inventory migration and generated-type ownership transfer |
| 91 | [Sanitize AI Route Error Envelopes](./027-sanitize-ai-route-error-envelopes.md) | P1 | S | Low | BLOCKED | Plan 025 must be DONE; its reviewed worktree is build-blocked |
| 92 | [Bound Public AI Generate Input](./028-bound-public-ai-generate-input.md) | P1 | S | Medium | BLOCKED | Plan 027 must be DONE; it remains blocked behind Plan 025 |
| 93 | [Prevent Discord Interaction Replays](./029-prevent-discord-interaction-replays.md) | P1 | M | Low | BLOCKED | explicit approval to delete/reset the retained local Supabase volume |
| 94 | [Index Workspace API-Key Validation by Prefix](./107-index-workspace-api-key-prefix.md) | P1 | S | Low | BLOCKED | replay retained worktree atop Plan 151; full exact-base pgTAP baseline remains red |
| 95 | [Enforce Build-Info Coverage for Deployed Next Apps](./011-enforce-build-info-coverage.md) | P1 | S | Low | BLOCKED | Apps/Tools Turbopack process/port `EPERM`; reviewed worktree retained |
| 96 | [Align Public Security Claims with Maintained Evidence](./039-align-public-security-claims-with-evidence.md) | P1 | S | Low | BLOCKED | active marketing-shell ownership of both required Web message bundles |
| 97 | [Surface Git Repository Toggle Failures](./048-surface-git-repository-toggle-failures.md) | P1 | S | Low | BLOCKED | Git Turbopack process/port `EPERM`; reviewed worktree retained |
| 98 | [Persist Task Description Representations Atomically](./071-persist-task-descriptions-atomically.md) | P1 | S | Medium | BLOCKED | Tasks Turbopack process/port `EPERM`; reviewed worktree retained |
| 99 | [Stop Eager My Tasks Cross-Workspace Fan-Out](./079-stop-eager-my-tasks-fanout.md) | P1 | M | Medium | BLOCKED | Tasks Turbopack process/port `EPERM`; reviewed worktree retained |
| 100 | [Cover Manual Profile Linking and Manager Consolidation](./072-cover-manual-profile-linking.md) | P1 | M | Low | BLOCKED | Contacts Turbopack process/port `EPERM`; reviewed worktree retained |
| 101 | [Paginate GitHub Detail Collections Explicitly](./089-paginate-github-detail-collections.md) | P1 | M | Medium | BLOCKED | Git Turbopack `EPERM`; retained worktree must also replay main's `52f4aa1b12` locale contract |
| 102 | [Make Note-to-Task Conversion Lossless and Atomic](./058-make-note-to-task-conversion-lossless-and-atomic.md) | P1 | M | Medium | BLOCKED | Mail/Zalo generated database type ownership transfer |
| 103 | [Make Calendar Reset Atomic](./059-make-calendar-reset-atomic.md) | P1 | M | Medium | BLOCKED | Mail/Zalo generated database type ownership transfer |
| 104 | [Make Tulearn Answer Submission Atomic](./037-make-tulearn-answer-submission-atomic.md) | P1 | M | Medium | BLOCKED | Plan 036; Mail/Zalo generated database type ownership transfer |
| 105 | [Make Track Pause and Resume Transitions Atomic](./038-make-track-pause-resume-transitions-atomic.md) | P1 | M | Medium | BLOCKED | Mail/Zalo generated database type ownership transfer |
| 106 | [Authorize and Atomically Manage Task Progress Metrics](./043-make-task-progress-default-metrics-atomic.md) | P0 | M | Medium | BLOCKED | Plans 057/154/163 plus Tasks/database/generated-type transfer |
| 107 | [Claim and Batch Task Deadline Reminders](./022-claim-and-batch-task-deadline-reminders.md) | P1 | M | Medium | BLOCKED | Mail/Zalo generated database type ownership transfer |
| 108 | [Restore the Release Lockfile Invariant](./003-restore-release-lockfile-invariant.md) | P1 | M | Low | BLOCKED | Mail lockfile and release-lifecycle ownership transfer; preserve current unrelated lockfile drift |
| 109 | [Characterize Web and Rust Cron-Job Deletion](./103-characterize-cron-job-deletion-parity.md) | P1 | S | Low | BLOCKED | cron/frontend status handoff ownership transfer |
| 110 | [Make Meet Plan and Timeblock Edits Atomic](./099-make-meet-plan-edits-atomic.md) | P1 | M | Medium | BLOCKED | G22 route-artifact and generated-type ownership transfer |
| 111 | [Bound User-Group Session Listings in TypeScript and Rust](./102-bound-user-group-session-listings.md) | P1 | L | High | BLOCKED | G22 and backend migration ownership transfer |
| 112 | [Centralize Race-Safe Workspace Encryption-Key Creation](./101-centralize-workspace-encryption-key-creation.md) | P1 | M | Medium | BLOCKED | Calendar, Tasks, Finance/Inventory, and Mail lockfile ownership transfer |
| 113 | [Make Replacement Timer Starts Atomic](./083-make-replacement-timer-starts-atomic.md) | P1 | L | High | BLOCKED | G22 migration artifacts and generated database type ownership release |
| 114 | [Server-Paginate Nova Leaderboards](./084-server-paginate-nova-leaderboards.md) | P1 | L | Medium | BLOCKED | generated database type and migration ownership release |
| 115 | [Preserve AI Key External-App Binding During Rotation](./077-preserve-ai-key-external-app-binding.md) | P1 | S | Medium | BLOCKED | CS35 gateway machine-credential ownership transfer |
| 116 | [Bound Mira Task Context Retrieval](./078-bound-mira-task-context.md) | P1 | M | Medium | BLOCKED | generated database type and migration ownership release |
| 117 | [Make Meeting Recording Transitions Atomic](./068-make-meeting-recording-transitions-atomic.md) | P1 | L | Medium | BLOCKED | Plan 066; G22 route/migration artifacts ownership release |
| 118 | [Bound Meeting Recording History](./069-bound-meeting-recording-history.md) | P1 | L | Medium | BLOCKED | Plan 066; G22 route/migration artifacts ownership release |
| 119 | [Await Public AI Generate Credit Settlement](./053-await-public-ai-generate-credit-settlement.md) | P1 | M | Medium | BLOCKED | Plan 028; operator disposition of duplicate non-null execution deductions |
| 120 | [Batch Task Notification Pagination](./054-batch-task-notification-pagination.md) | P1 | M | Medium | BLOCKED | G22 route-artifact ownership release or explicit transfer |
| 121 | [Enroll Satellite Unit Tests in the Canonical Gate](./010-enroll-satellite-unit-tests-in-canonical-gate.md) | P1 | L | Medium | BLOCKED | Plan 004 DONE at `558397b971`; active Tasks and Inventory coordination lanes |
| 122 | [Bind Dataset API-Key Operations to Their Workspace](./001-bind-dataset-api-key-operations-to-workspace.md) | P1 | M | Medium | BLOCKED | G22 role/migration lane owns shared route artifacts |
| 123 | [Prevent Role Grants to Non-Members](./002-prevent-role-grants-to-non-members.md) | P1 | L | High | BLOCKED | G22 role/migration lane; then operator decision if orphan count is nonzero |
| 124 | [Use Pay App-Session Actors Across Billing APIs](./007-use-pay-app-session-actors.md) | P1 | M | Medium | BLOCKED | Reconcile nonterminal Pay migration handoff |
| 125 | [Pin and Verify the Rust Backend Toolchain](./008-pin-the-rust-backend-toolchain.md) | P1 | S | Low | BLOCKED | Native CI/cache handoff owns Rust workflow |
| 126 | [Complete Rust v1 Workspace API-Key Authentication](./021-complete-rust-v1-api-key-auth.md) | P1 | S | Medium | BLOCKED | Backend migration ownership transfer |
| 127 | [Bound Manual Profile-Link Candidate Search](./073-bound-manual-profile-link-candidates.md) | P1 | M | Medium | BLOCKED | Plan 072; Mail, Inventory, and Zalo generated-type ownership release; Richfield dirty-path provenance clears |
| 128 | [Paginate Mail Thread Lists in the Database](./093-paginate-mail-thread-lists-in-database.md) | P1 | L | High | BLOCKED | Mail catch-all ownership transfer |
| 129 | [Make Mail Thread Detail and State Changes Complete](./094-complete-mail-thread-detail-state.md) | P1 | M | Medium | BLOCKED | Mail catch-all ownership transfer |
| 130 | [Add Provider-Native Drive Directory Cursors](./095-add-provider-native-drive-cursors.md) | P1 | L | High | BLOCKED | G22, backend migration, and shared-storage ownership transfer |
| 131 | [Paginate Contacts Attention Filtering in the Database](./096-paginate-contacts-attention-filter.md) | P1 | M | Medium | BLOCKED | Contacts database and migration ownership transfer |
| 132 | [Bound Forms Response Page Materialization](./111-bound-forms-response-page-materialization.md) | P1 | M | Medium | BLOCKED | Forms satellite ownership transfer |
| 133 | [Enroll Satellite Shells in Translation Contract Checks](./097-enroll-satellite-translation-contracts.md) | P1 | M | Low | BLOCKED | Chat, Mail, and CI/tooling ownership transfer |
| 134 | [Commit Teach Manual Grading and Attempt Totals Together](./116-commit-teach-manual-grading-atomically.md) | P1 | M | Medium | BLOCKED | generated-type ownership transfer |
| 135 | [Reconcile Pay Seat-Count Updates Durably](./119-reconcile-pay-seat-count-updates.md) | P1 | M | Medium | BLOCKED | Pay migration and generated-type ownership transfer |
| 136 | [Put UI Singleton Runtimes at the Host Boundary](./124-put-ui-singleton-runtimes-at-host-boundary.md) | P1 | M | Medium | BLOCKED | Plan 123; Mail catch-all lockfile ownership release |
| 137 | [Collapse the Shadowed Time-Tracker Implementation](./112-collapse-shadowed-time-tracker.md) | P2 | M | Medium | BLOCKED | Tasks Turbopack process/port `EPERM`; reviewed worktree retained |
| 138 | [Retire the Dead Web Calendar-Settings Fork](./117-retire-dead-web-calendar-settings.md) | P2 | S | Low | BLOCKED | Web Turbopack build session disappeared twice; reviewed worktree retained |
| 139 | [Remove Shortener Phantom Dependencies](./019-remove-shortener-phantom-dependencies.md) | P2 | S | Low | BLOCKED | Mail lockfile ownership transfer |
| 140 | [Retire the Dead Mobile Task-Description Flag](./085-retire-dead-mobile-task-description-flag.md) | P2 | S | Low | BLOCKED | product confirmation that rich editing is fully shipped |
| 141 | [Bound Report-Selector History Queries](./005-bound-report-selector-history.md) | P2 | S | Low | BLOCKED | Daily-report handoff owns report-view tests |
| 142 | [Remove Track's Unused APIs Dependency](./065-remove-track-unused-apis-dependency.md) | P2 | S | Low | BLOCKED | Mail catch-all lockfile ownership release |
| 143 | [Decouple Shared Types from UI Runtimes](./070-decouple-shared-types-from-ui-runtimes.md) | P2 | S | Medium | BLOCKED | Mail catch-all lockfile ownership release |
| 144 | [Put Masonry React at the Host Boundary](./074-put-masonry-react-at-host-boundary.md) | P2 | S | Medium | BLOCKED | Mail catch-all lockfile ownership release |
| 145 | [Put Masonry on the Governed Package-Release Pipeline](./075-govern-masonry-package-releases.md) | P2 | M | Medium | BLOCKED | Plan 074; non-Vercel JS CI/cache ownership release |
| 146 | [Extract One Shared Calendar Scheduling Core](./108-extract-shared-calendar-scheduling-core.md) | P2 | L | High | BLOCKED | Tasks, Calendar follow-up, and lockfile ownership transfer |
| 147 | [Consolidate Copied Log-Drain Runtimes](./098-consolidate-log-drain-runtimes.md) | P2 | L | High | BLOCKED | explicit multi-owner observability consolidation lane |
| 148 | [Retire the Stale Public Onboarding Helper](./121-retire-stale-public-onboarding-helper.md) | P2 | M | Medium | BLOCKED | connected-onboarding ownership transfer |
| 149 | [Authorize and Preserve Task Mention Cleanup](./142-authorize-task-mention-cleanup.md) | P0 | M | Medium | BLOCKED | Plan 071's atomic persistence contract is retained and build-blocked |
| 150 | [Derive Storefront Conversions from Authoritative Checkout State](./143-derive-storefront-conversions-authoritatively.md) | P0 | M | Medium | BLOCKED | Finance/Inventory migration and generated migration/type ownership transfer |
| 151 | [Make AI Bonus-Credit Adjustments Atomic](./146-make-ai-bonus-credit-adjustments-atomic.md) | P0 | M | Medium | BLOCKED | generated database type and migration ownership transfer |
| 152 | [Bound Bulk Student-Performance Reports](./147-bound-bulk-student-performance-reports.md) | P0 | L | High | BLOCKED | education-extraction note archival; migration/generated-type ownership transfer |
| 153 | [Retire Stale JSR Publication Metadata](./148-retire-stale-jsr-publication-metadata.md) | P2 | M | Medium | BLOCKED | Forms/CI test ownership transfer; external-consumer disposition |
| 154 | [Restore a Green Exact-Base pgTAP Baseline](./154-restore-green-exact-base-pgtap-baseline.md) | P0 | M | Medium | BLOCKED | external-AI and Inventory database coordination; conditional generated-type transfer; education note disposition |
| 155 | [Generate Receipts from Paid Orders](./155-generate-receipts-from-paid-orders.md) | P0 | M | Medium | BLOCKED | Pay migration handoff transfer |
| 156 | [Bound and Serialize Time-Category Copying](./156-bound-serialize-time-category-copy.md) | P1 | M | Medium | BLOCKED | Plan 154; G22 route artifacts plus migration/generated-type ownership transfer |
| 157 | [Make `sb:up` Apply Migrations Only](./157-make-supabase-up-apply-only.md) | P1 | S | Low | BLOCKED | root manifest transfer from Forms and completed Hive/Mind note archival |
| 158 | [Retire Legacy Workspace-User APIs and Enforce Granular Permissions](./158-retire-legacy-workspace-user-apis.md) | P0 | L | High | BLOCKED | Plans 154, 161, and 163; Contacts/users-core, backend/G22 route artifacts, and migration/type ownership transfer |
| 159 | [Make Workspace Deletion Fail Closed on Billing Revocation](./159-make-workspace-deletion-billing-safe.md) | P0 | M | High | BLOCKED | Pay migration and G22 route-artifact ownership transfer |
| 160 | [Commit Habit and Calendar Completion Together](./160-make-habit-completion-atomic.md) | P0 | M | Medium | BLOCKED | Plans 154 and 163; Tasks route plus migration/type ownership transfer |
| 161 | [Persist Executable Ownership for Accepted Route Removals](./161-persist-accepted-removal-ownership.md) | P1 | L | Medium | BLOCKED | G22/backend and shared TanStack route-artifact ownership transfer |
| 162 | [Correct the Platform-Wide Satellite API Ownership Overview](./162-correct-platform-satellite-api-overview.md) | P1 | S | Low | DONE | reviewed commit `22c96a18ef` on `docs/satellite-api-ownership-overview` |
| 163 | [Generate Database Types from the Disposable Supabase Stack](./163-generate-types-from-isolated-supabase.md) | P1 | S | Low | DONE | reviewed commit `3f61e928ea` on `chore/isolated-supabase-typegen` |
| 164 | [Require Mutation Permission for the Global Holiday Calendar](./164-authorize-global-holiday-mutations.md) | P0 | M | Medium | BLOCKED | Plan 154; backend and database/generated-type ownership transfer |
| 165 | [Cursor-Page Contacts Report Snapshot History](./165-cursor-page-report-snapshot-history.md) | P1 | M | Medium | BLOCKED | daily-report delivery handoff transfer |
| 166 | [Preserve Partial Bulk User-Merge Results for Review](./166-preserve-partial-bulk-user-merge-results.md) | P1 | M | Medium | BLOCKED | Contacts users/database and G22 route-artifact transfers |
| 167 | [Preserve AI Usage Charges When Pricing Is Unavailable](./167-preserve-ai-charges-when-pricing-fails.md) | P0 | L | High | BLOCKED | Plan 154, Plan 163, CS35 gateway/external-AI, and database/type ownership transfer |
| 168 | [Make Topic-Announcement Imports Atomic and Replay-Safe](./168-make-topic-announcement-imports-atomic.md) | P1 | M | Medium | BLOCKED | G22 route-artifact and database/generated-type ownership transfer |
| 169 | [Delete Whiteboard Records Before Destructive Asset Cleanup](./169-delete-whiteboards-before-assets.md) | P1 | S | Medium | BLOCKED | G22 route-artifact ownership transfer |
| 170 | [Restrict Finance Creator RPCs to Trusted Server Callers](./170-restrict-finance-creator-rpcs.md) | P0 | M | Medium | BLOCKED | Plan 154 and Finance/Inventory database ownership transfer |
| 171 | [Restrict Workspace-User Repair RPCs to Authorized Actors](./171-restrict-workspace-user-repair-rpcs.md) | P0 | M | Medium | BLOCKED | Plan 154 plus database/type and Finance/education coordination |
| 172 | [Claim and Durably Settle Topic-Announcement Delivery](./172-claim-topic-announcement-delivery.md) | P0 | L | High | BLOCKED | Plans 154/163 plus G22, database/type, and message-bundle ownership transfer |
| 173 | [Retire the Dead Web Infrastructure Runtime Fork](./173-retire-dead-web-infrastructure-fork.md) | P2 | M | Medium | BLOCKED | backend/G22 and Web infrastructure coordination-note disposition |
| 174 | [Use Storage Core as Infrastructure's Single Provider](./174-use-storage-core-in-infrastructure.md) | P2 | S | Medium | BLOCKED | active Inventory revenue-bundles handoff owns the required Infrastructure inventory paths; coordinate ordering with Plan 095 |
| 175 | [Authorize Direct Task-List Access by Board Actor](./175-authorize-direct-task-list-access.md) | P0 | M | High | BLOCKED | Plans 154/163; broad Tasks and database/generated-type ownership transfer |
| 176 | [Bind Board-Template Backgrounds to Their Owner](./176-bind-board-template-backgrounds-to-owner.md) | P0 | M | Medium | BLOCKED | Plans 082/154/163; broad Tasks and database/generated-type ownership transfer |
| 177 | [Restrict AI Execution Analytics to Trusted Server Callers](./177-restrict-ai-analytics-rpcs.md) | P0 | M | Medium | BLOCKED | Plans 154/163; external-AI and database/generated-type ownership transfer |
| 178 | [Commit Storefront Listing Graphs Atomically](./178-commit-storefront-listing-graphs-atomically.md) | P1 | L | High | BLOCKED | Plans 154/163; Finance/Inventory application, migration, and generated-type ownership transfer |
| 179 | [Retire the Dead Web Finance-Settings Fork](./179-retire-dead-web-finance-settings.md) | P2 | S | Medium | BLOCKED | canonical disposition or exact-path transfer from the working Finance/Inventory note |
| 180 | [Bind Accessible-Task RPCs to the Authenticated Actor](./180-bind-accessible-task-rpc-to-actor.md) | P0 | M | High | BLOCKED | Plans 154/163; Tasks, database, and generated-type ownership transfer |
| 181 | [Fail Closed on Public Session-Management RPCs](./181-fail-closed-session-management-rpcs.md) | P0 | M | High | BLOCKED | Plans 154/163; database/type and backend/G22 ownership transfer |
| 182 | [Retire the Public Personal-Workspace Backfill RPC](./182-retire-public-personal-workspace-backfill.md) | P0 | S | Medium | BLOCKED | Plans 154/163; database/type and connected-onboarding coordination |
| 183 | [Authorize Direct Attendance and Feedback Access](./183-authorize-attendance-feedback-direct-access.md) | P0 | M | Medium | BLOCKED | Plans 154/163; Contacts/education and database/type transfer; backend/G22 review |
| 184 | [Restrict Direct Transaction-Category Mutations](./184-restrict-transaction-category-direct-mutations.md) | P0 | M | Medium | BLOCKED | Plans 154/163; Finance/Inventory and database/type transfer; backend/G22 review |
| 185 | [Restrict Global Task Sort-Key Normalization](./185-restrict-task-sort-normalization.md) | P0 | S | Medium | BLOCKED | Plan 154; Tasks/database ownership transfer and cron-owner verification |
| 186 | [Restrict Realtime Log-Aggregation Writes](./186-restrict-realtime-log-aggregation-writes.md) | P0 | M | Medium | BLOCKED | Plan 154; database and Infrastructure/backend contract review |
| 187 | [Restrict Finance Migration-Helper RPCs](./187-restrict-finance-migration-helper-rpcs.md) | P0 | S | Medium | BLOCKED | Plan 154; Finance/Inventory database ownership transfer |
| 188 | [Authorize Direct Workspace User-Group Writes](./188-authorize-direct-user-group-writes.md) | P0 | M | Medium | BLOCKED | Plans 154/163; Contacts/education, database/type, and backend/G22 transfer/review |
| 189 | [Authorize and Allowlist Workspace User Fields](./189-authorize-workspace-user-fields.md) | P0 | M | High | BLOCKED | Plans 154/163; G22/backend route artifacts and database/type ownership transfer |
| 190 | [Authorize Time-Tracking Bypass and Break-Type Mutations](./190-restrict-time-tracking-definer-mutations.md) | P0 | M | High | BLOCKED | Plan 154; Track/time-tracking and database ownership transfer |
| 191 | [Restrict Invoice Analytics RPCs to Authorized Server Callers](./191-restrict-invoice-analytics-rpcs.md) | P0 | M | Medium | BLOCKED | Plan 154; Finance/Inventory database and G19 backend review/transfer |
| 192 | [Bind Transaction Statistics to the Authenticated Actor](./192-bind-transaction-stats-to-authenticated-actor.md) | P0 | M | Medium | BLOCKED | Plan 154; Finance/Inventory and G20 wallets/transactions backend ownership transfer |
| 193 | [Authorize Direct Time-Tracking Analytics Access](./193-authorize-time-tracking-analytics-rpcs.md) | P0 | M | High | BLOCKED | Plans 154/163; Track/database and G22 backend review/transfer |
| 194 | [Make Documentation Contribution Links Executable](./194-fix-docs-contribution-links.md) | P2 | S | Low | DONE | reviewed commit `e539356d39` on `docs/fix-contribution-links` |
| 195 | [Restrict Suspension Status to Trusted Callers](./195-restrict-suspension-status-rpc.md) | P1 | S | Low | BLOCKED | Plans 154/163; full isolated pgTAP baseline must be green |
| 196 | [Update FREE AI Credit Allocations Atomically](./196-update-free-ai-credit-allocations-atomically.md) | P1 | M | Medium | BLOCKED | Plans 154/163 plus Plan 146 migration/generated-type ownership transfer |
| 197 | [Keep Workspace-User CRM Pages in Contacts](./197-keep-workspace-users-in-contacts.md) | P1 | M | Medium | DONE | reviewed commit `9747845aae` on `refactor/tanstack-contacts-user-redirects` |
| 198 | [Restrict Generic Workspace-User Merge Helpers](./198-restrict-generic-user-merge-helpers.md) | P0 | M | Medium | BLOCKED | Plans 154/163 plus Contacts/database merge-boundary ownership transfer |
| 199 | [Make Task History Reverts Atomic](./199-make-task-history-reverts-atomic.md) | P0 | M | Medium | BLOCKED | Plans 154/163 plus Tasks and database/generated-type ownership transfer |
| 200 | [Copy Task Boards Atomically and Completely](./200-copy-task-boards-atomically.md) | P1 | M | Medium | BLOCKED | Plans 154/163 plus Tasks and database/generated-type ownership transfer |
| 201 | [Retire the Orphaned Web Mobile-Deployment Fork](./201-retire-orphaned-web-mobile-deployment.md) | P2 | S | Medium | BLOCKED | Plans 173 and 174 |
| 202 | [Restrict Workspace-Overview RPCs to Trusted Callers](./202-restrict-workspace-overview-rpcs.md) | P0 | S | Low | BLOCKED | Plans 154/163 plus database/Infrastructure ownership transfer |
| 203 | [Restrict Report Status Summaries to Authorized Server Callers](./203-restrict-report-status-summary-rpcs.md) | P0 | S | Medium | BLOCKED | Plans 154/163 plus daily-report/database ownership transfer and backend review |
| 204 | [Page and Verify Edge Trust-Cache Reconciliation](./204-page-edge-trust-cache-reconciliation.md) | P1 | M | Medium | BLOCKED | Plans 154/163 plus cron/frontend and database/type ownership transfer |
| 205 | [Reconcile Infrastructure GitHub Branches Completely](./205-reconcile-infrastructure-github-branches.md) | P1 | M | Medium | BLOCKED | retained worktree; Infrastructure typecheck failed twice on test-only inference |
| 206 | [Retire the Orphaned TanStack Contacts Component Fork](./206-retire-tanstack-contacts-component-fork.md) | P2 | M | Medium | BLOCKED | Plan 197 DONE; TanStack and Mail-owned lockfile transfer |
| 207 | [Restrict AI Credit Ledger RPCs to Trusted Server Callers](./207-restrict-ai-credit-ledger-rpcs.md) | P0 | M | Medium | BLOCKED | Plans 154/163 plus database/type and AI metering-owner review |
| 208 | [Retire Orphaned Web Tasks-Domain Forks](./208-retire-orphaned-web-tasks-forks.md) | P2 | S | Low | TODO | transplant retained scoped diff into fresh worktree at `cdef1c5533` |
| 209 | [Cursor-Page Enhanced Workspace Members Across Web and Rust](./209-cursor-page-enhanced-workspace-members.md) | P1 | L | Medium | BLOCKED | Plans 154/163 plus G22/backend, database/type, Web/internal-api, and Mobile ownership |
| 210 | [Aggregate Push Dashboard Metrics in One Bounded Query](./210-aggregate-push-dashboard-metrics.md) | P1 | M | Low | BLOCKED | Plans 154/163 plus database/generated-type ownership transfer |
| 211 | [Derive Cross-App Identity Claims from Canonical User Data](./211-derive-cross-app-identity-claims.md) | P0 | M | High | BLOCKED | Plans 154/163 plus database/type, G22 route artifacts, and Tasks authorization review |
| 212 | [Bind Workspace API-Key Roles to the Key Workspace](./212-bind-api-key-roles-to-workspace.md) | P0 | M | Medium | BLOCKED | Plans 154/163 plus G22 route artifacts and database/type ownership transfer |
| 213 | [Make AI Gateway-Model Sync Atomic and Observable](./213-make-ai-model-sync-atomic-observable.md) | P1 | M | Medium | BLOCKED | Plans 154/163 plus database/type and G22 route-artifact review |
| 214 | [Retire the Obsolete Browser Multi-Session Store](./214-retire-obsolete-multi-session-store.md) | P2 | S | Low | TODO | transplant retained scoped diff into fresh worktree at `cdef1c5533` |
| 215 | [Retire the Orphaned Web EPM Implementation](./215-retire-orphaned-web-epm-implementation.md) | P2 | S | Low | TODO | transplant retained scoped diff into fresh worktree at `cdef1c5533`; exact-main Web build is green |
| 216 | [Keep Root-Locale Resolution Build-Safe](./216-keep-root-locale-resolution-build-safe.md) | P0 | S | Low | DONE | final corrective commit `3a09b070ab`; integrated and exact-main verified |
| 217 | [Bind Inventory Promotion Links to the Route Workspace](./217-bind-inventory-promotion-links-to-workspace.md) | P0 | S | Low | BLOCKED | Finance/Inventory exact-path ownership transfer |
| 218 | [Update Task Capacity Rules Atomically](./218-update-task-capacity-rules-atomically.md) | P1 | M | Medium | BLOCKED | Plans 154/163 plus Tasks/database/type ownership transfer |
| 219 | [Make Worktree Setup Lockfile-Preserving by Default](./219-make-worktree-setup-lockfile-preserving.md) | P1 | S | Low | BLOCKED | Forms root-manifest and Mail lockfile ownership transfer |
| 220 | [Validate the Release Please Head Before Privileged Merge](./220-validate-release-please-head-before-privileged-merge.md) | P0 | M | Medium | BLOCKED | active release auto-merge handoff owns workflow/test paths |
| 221 | [Batch Form Media URL Signing](./221-batch-form-media-url-signing.md) | P1 | S | Medium | BLOCKED | nonterminal Forms handoff owns all app paths |
| 222 | [Remove Unused React Runtimes from the APIs Package](./222-remove-unused-react-runtimes-from-apis.md) | P2 | S | Low | BLOCKED | Mail handoff owns `bun.lock` |
| 223 | [Replace the Playground Starter README](./223-replace-playground-starter-readme.md) | P2 | S | Low | TODO | no active exact-path owner |
| 224 | [Bind Email Audit Reads to the Authorized Workspace](./224-bind-email-audit-reads-to-workspace.md) | P0 | S | Low | TODO | no active exact-path owner |
| 225 | [Redact Calendar Sync Tokens and Provider Payloads from Logs](./225-redact-calendar-sync-provider-data-from-logs.md) | P0 | S | Low | TODO | no active exact-path owner; coordinate adjacent Calendar plans |
| 226 | [Make External Chat Delivery Replay-Safe](./226-make-external-chat-delivery-replay-safe.md) | P1 | L | High | BLOCKED | Plans 154/163 plus active Zalo handoff transfer |
| 227 | [Cursor-Page External Chat Threads with Set-Based Summaries](./227-cursor-page-external-chat-threads.md) | P1 | M | Medium | BLOCKED | Plans 154/163 plus active Zalo handoff transfer |
| 228 | [Remove the Private Payment Peer from the Public APIs Package](./228-remove-private-payment-peer-from-public-apis.md) | P1 | M | Medium | BLOCKED | Mail lockfile and Pay payment-core exact-path transfer |
| 229 | [Bind Inventory Owners to Workspace Users in the Same Workspace](./229-bind-inventory-owners-to-workspace-users.md) | P0 | M | Medium | BLOCKED | Plans 154/163 plus Finance/Inventory app and migration ownership transfer |
| 230 | [Aggregate AI-Credit Workspace Member Counts Set-Wise](./230-aggregate-ai-credit-member-counts.md) | P1 | M | Medium | BLOCKED | Plans 146/154/163 plus exact balance-route and database/type transfer |
| 231 | [Fail AI Policy Reads Closed Before Editing](./231-fail-ai-policy-reads-closed.md) | P1 | S | Low | TODO | no active exact-path owner; coordinate adjacent external-AI policy work |
| 232 | [Govern or Privatize the Legal Package](./232-govern-or-privatize-legal-package.md) | P1 | M | Medium | BLOCKED | explicit public/private decision plus Pay/Forms release-path transfer |
| 233 | [Bind Calendar Schedule Sources to the Route Workspace](./233-bind-calendar-schedule-sources-to-workspace.md) | P0 | L | High | BLOCKED | Plans 154/163 plus Calendar event-policy and database/type coordination |
| 234 | [Update Referral Default Promotions Atomically](./234-update-referral-default-promotion-atomically.md) | P1 | M | Medium | BLOCKED | Plans 154/163 plus Finance/Inventory app and migration ownership transfer |
| 235 | [Transition Mobile Deployments Atomically](./235-transition-mobile-deployments-atomically.md) | P1 | M | Medium | BLOCKED | Plans 154/163 plus database/type transfer and Infrastructure authority review |
| 236 | [Smoke-Test Governed npm Tarballs Before Publication](./236-smoke-test-published-npm-tarballs.md) | P1 | M | Medium | BLOCKED | Plans 228/232 plus Forms/Pay release workflow and readiness transfer |
| 237 | [Make Calendar Schedule Cleanup Truthful and Recoverable](./237-make-calendar-schedule-cleanup-truthful.md) | P1 | M | High | BLOCKED | Plans 154/163/233 plus Calendar/database ownership transfer |
| 238 | [Bind Form Studio Resources to the Route Workspace](./238-bind-form-studio-resources-to-workspace.md) | P0 | M | Medium | BLOCKED | nonterminal Forms handoff owns all application paths |
| 239 | [Require Board-Share Administration Permission](./239-require-board-share-administration.md) | P0 | M | Medium | TODO | no active exact-path owner; coordinate adjacent Tasks work |
| 240 | [Gate the Nova Criteria Catalog to Challenge Managers](./240-gate-nova-criteria-catalog.md) | P0 | S | Low | TODO | Plan 090 DONE catalog helper base |
| 241 | [Save Form Definitions Atomically Without Detaching Answers](./241-save-form-definitions-atomically.md) | P1 | L | High | BLOCKED | Plans 154/163/238 plus Forms/database/type transfer |
| 242 | [Create Inventory-Backed Invoices Atomically](./242-create-inventory-invoices-atomically.md) | P1 | L | High | BLOCKED | Plans 154/163 plus Finance/Inventory/database/type transfer |
| 243 | [Validate and Claim Lead Follow-Up Email Before Delivery](./243-validate-and-claim-lead-follow-up-email.md) | P0 | L | High | BLOCKED | Plans 154/163 plus G22, Contacts, and database/type transfer |
| 244 | [Bind Subscription Invoices to One Workspace Atomically](./244-bind-subscription-invoices-to-one-workspace.md) | P0 | L | High | BLOCKED | Plans 154/163/242 plus Finance/Inventory/database/type transfer |
| 245 | [Cursor-Page Rich-Text Task Notes Across TypeScript and Rust](./245-cursor-page-rich-text-task-notes.md) | P1 | L | Medium | BLOCKED | Plans 154/163 plus G22/backend artifact transfer |
| 246 | [Declare the APIs Types Runtime Dependency](./246-declare-apis-types-runtime-dependency.md) | P1 | S | Low | BLOCKED | Plans 228/236 plus Mail lockfile transfer |
| 247 | [Enforce TanStack Migration Manifest Freshness](./247-enforce-tanstack-manifest-freshness.md) | P1 | S | Low | BLOCKED | G22 manifest/docs and native-CI workflow transfer |
| 248 | [Bind Meet Participant Mutations to One Plan](./248-bind-meet-participant-mutations-to-plan.md) | P0 | M | Medium | BLOCKED | Plans 154/163 plus database/type ownership transfer |
| 249 | [Bound and Resume Inventory-to-Polar Drift Repair](./249-bound-inventory-polar-drift-repair.md) | P1 | L | High | BLOCKED | Plans 154/163 plus Finance/Inventory, Polar, database/type, and internal-api transfer |
| 250 | [Single-Source the Post-Email Queue Runtime](./250-single-source-post-email-queue-runtime.md) | P1 | L | High | BLOCKED | daily-report queue, Mail lockfile, and G22 route-artifact transfer |
| 251 | [Fail Closed During Polar Subscription Reconciliation](./251-fail-closed-polar-subscription-reconciliation.md) | P0 | S | Low | BLOCKED | Pay migration exact-path transfer |
| 252 | [Keep the Billing Summary Free of Polar Seat Fetches](./252-skip-polar-seats-in-billing-summary.md) | P1 | S | Low | BLOCKED | Pay migration exact-path transfer |
| 253 | [Single-Source the TypeScript Mobile-Version Policy](./253-single-source-mobile-version-policy.md) | P1 | M | Medium | TODO | no active exact-path owner |
| 254 | [Describe the Migration Stack as Validation-Only Until Cutover](./254-correct-migration-deployment-overview.md) | P1 | S | Low | TODO | coordinate backend/G22 authority wording |
| 255 | [Rotate SePay Endpoints Without Breaking Delivery](./255-rotate-sepay-endpoints-without-delivery-gaps.md) | P0 | L | High | BLOCKED | Plans 154/163 plus Finance/Inventory, SePay, database/type transfer |
| 256 | [Replace Auth-Recovery Overrides Atomically](./256-replace-auth-recovery-overrides-atomically.md) | P0 | M | Medium | BLOCKED | Plans 154/163 plus database/type transfer |
| 257 | [Make Auth-Recovery Email Issuance Observable End to End](./257-characterize-auth-recovery-email-issuance.md) | P1 | M | Medium | TODO | rebase after Plan 256 if it lands first |
| 258 | [Allowlist Inventory Setup Creation Fields](./258-allowlist-inventory-setup-creation-fields.md) | P1 | S | Low | BLOCKED | active Inventory exact-path transfer |
| 259 | [Page My Tasks History Before Relation Materialization](./259-page-my-tasks-history-before-materialization.md) | P1 | L | Medium | BLOCKED | Plans 154/163 plus Tasks/database/type, Mobile, backend/G22 coordination; sequence with Plan 079 |
| 260 | [Make Deprecated Browser Supabase Access Opt-In](./260-retire-deprecated-browser-supabase-client.md) | P1 | L | High | BLOCKED | Plans 026/079/259 where paths overlap plus exact caller ownership transfer |
| 261 | [Secure and Atomically Create Task Progress Leaderboards](./261-secure-task-progress-leaderboard-lifecycle.md) | P0 | L | Medium | BLOCKED | Plans 057/154/163 plus Tasks/database/type transfer |
| 262 | [Authenticate and Bound Mail Draft Attachment Ingress](./262-authenticate-and-bound-mail-attachment-ingress.md) | P1 | M | Medium | BLOCKED | active Mail exact-path transfer |
| 263 | [Bound Multi-Select Task Mutation Concurrency](./263-bound-multi-select-task-mutation-concurrency.md) | P1 | L | High | TODO | no active exact-path owner; coordinate adjacent Tasks work |
| 264 | [Put Utils Host Runtimes at the Peer Boundary](./264-put-utils-host-runtimes-at-peer-boundary.md) | P1 | M | Medium | BLOCKED | Plan 236 plus Mail lockfile transfer |
| 265 | [Stop Logging Workspace Note Bodies](./265-stop-logging-workspace-note-bodies.md) | P0 | S | Low | TODO | no active exact-path owner; narrow legacy log deletion only |
| 266 | [Commit Mail Inbound Message Graphs Atomically](./266-commit-mail-inbound-message-graphs-atomically.md) | P1 | L | High | BLOCKED | Plans 009/154/163 plus Mail and database/type transfer |
| 267 | [Materialize Recurring Session Relations Set-Wise](./267-materialize-recurring-session-relations-set-wise.md) | P1 | L | High | BLOCKED | Plans 154/163 plus database/type and adjacent user-group transfer |
| 268 | [Make Mobile Setup Lockfile-Preserving](./268-make-mobile-setup-lockfile-preserving.md) | P2 | S | Low | BLOCKED | Forms root-package ownership transfer |
| 269 | [Align Native TypeScript Release-Age Exceptions](./269-align-native-typescript-release-age-exceptions.md) | P2 | S | Low | BLOCKED | dirty `bunfig.toml` disposition plus native-CI test transfer |
| 270 | [Authorize Global Email-Blacklist Mutations](./270-authorize-global-email-blacklist-mutations.md) | P0 | M | Medium | BLOCKED | Plans 154/163 plus backend/G22 and database/type transfer |
| 271 | [Contain Zalo Listener Callback Failures](./271-contain-zalo-listener-callback-failures.md) | P1 | S | Low | BLOCKED | active Zalo handoff exact-path transfer |
| 272 | [Batch Mail AI-Label Context](./272-batch-mail-ai-label-context.md) | P1 | M | Medium | BLOCKED | Plans 154/163 plus Mail and database/type transfer |
| 273 | [Characterize the TOTP HTTP Boundary](./273-characterize-totp-http-boundary.md) | P1 | M | Low | TODO | no active exact-path owner; test-only characterization |
| 274 | [Re-Home Hard-Cutover Satellite E2E Contracts](./274-rehome-satellite-e2e-contracts.md) | P1 | L | Medium | BLOCKED | satellite, lockfile, and E2E workflow/helper ownership transfer |
| 275 | [Allowlist Product Supplier Item Updates](./275-allowlist-product-supplier-item-updates.md) | P0 | S | Low-Medium | BLOCKED | active Inventory exact-path transfer; coordinate Plan 258 |
| 276 | [Authorize and Allowlist Workspace Settings Mutations](./276-authorize-workspace-settings-mutations.md) | P0 | M | Medium | BLOCKED | G22 route-artifact transfer plus Contacts/Inventory caller coordination; sequence with Plan 234 |
| 277 | [Page Internal Accounts at the Data Source](./277-page-internal-accounts-at-the-data-source.md) | P1 | L | Medium | BLOCKED | Plan 154, completed Plan 163 base, and database/type transfer |
| 278 | [Preserve the Lockfile During Routine Cleanup](./278-preserve-lockfile-during-routine-cleanup.md) | P1 | S | Low | BLOCKED | Plan 004 plus Forms root-package ownership transfer |
| 279 | [Protect Hot Rust Build Targets from Pruning](./279-protect-hot-rust-build-targets-from-pruning.md) | P1 | M | Low-Medium | TODO | no active exact-path owner |
| 280 | [Fail Square Refund and Dispute Settlement Closed](./280-fail-square-settlement-closed.md) | P0 | M | Medium | BLOCKED | active Finance/Inventory exact-path transfer |
| 281 | [Normalize Product-Supplier Workspace Aliases](./281-normalize-product-supplier-workspaces.md) | P1 | S | Low-Medium | BLOCKED | Inventory transfer; sequence with Plans 258/275 and backend parity |
| 282 | [Single-Source Web and Track Time-Tracking Routes](./282-single-source-time-tracking-routes.md) | P0 | L | High | BLOCKED | completed Plans 044/055/113 plus G22 route-artifact and Mail lockfile transfer |
| 283 | [Bound Changelog Collections Before Rich-Content Projection](./283-bound-changelog-collections.md) | P1 | M | Medium | BLOCKED | backend/G22 changelog artifact transfer |
| 284 | [Characterize GitHub Installation-Token Issuance](./284-characterize-github-installation-token-issuance.md) | P1 | M | Low | TODO | no active exact-path owner |
| 285 | [Make Money Lover Imports Atomic and Exact-Replay Safe](./285-make-money-lover-imports-atomic.md) | P0 | L | Medium-High | BLOCKED | Plans 154/163 plus Finance route/UI and database/type transfer |
| 286 | [Aggregate Contacts User Statistics Once](./286-aggregate-contacts-user-statistics.md) | P1 | M | Medium | BLOCKED | Plans 154/163 plus database/type transfer and Contacts review |
| 287 | [Settle Mobile Deployment CI Tokens Atomically](./287-settle-mobile-deployment-ci-tokens-atomically.md) | P0 | M | Medium | BLOCKED | Plans 154/163 plus Infrastructure mobile-deployment authority coordination |
| 288 | [Enroll Every Database Script Test](./288-enroll-database-script-tests.md) | P1 | S | Low | TODO | completed Plan 004; no active exact-path owner |
| 289 | [Bind Finance Budgets and Spent Totals to One Workspace](./289-bind-finance-budgets-to-one-workspace.md) | P0 | L | High | BLOCKED | Plans 154/163 plus Finance and database/type ownership transfer |
| 290 | [Aggregate AI Studio Run-Step Counts Inside the Bounded Page](./290-aggregate-ai-studio-run-step-counts.md) | P1 | M | Medium | BLOCKED | Plans 154/163 plus AI Studio and database/type ownership transfer |
| 291 | [Remove Phantom Runtime Dependencies from the Public AI Package](./291-remove-phantom-ai-runtime-dependencies.md) | P1 | M | Medium | BLOCKED | Plan 236 plus Mail lockfile transfer and AI source-owner review |
| 292 | [Remove Production Credentials from Package Release Builds](./292-remove-production-credentials-from-package-release-builds.md) | P0 | S | Low-Medium | BLOCKED | Plan 236 and Forms release-test path transfer |
| 293 | [Bound Embedding Requests Before Metering and Provider Dispatch](./293-bound-embedding-requests-before-metering.md) | P0 | M | Medium | TODO | adjacent AI Studio metering review |
| 294 | [Delete Finance Invoices Through the Parent Row](./294-delete-finance-invoices-through-parent.md) | P0 | S | Low-Medium | BLOCKED | Finance exact-path transfer |
| 295 | [Allowlist Inventory Product Updates](./295-allowlist-inventory-product-updates.md) | P0 | S | Low-Medium | BLOCKED | active Finance/Inventory exact-path transfer |
| 296 | [Require Root Membership for Support-Inquiry Administration](./296-authorize-support-inquiry-administration.md) | P0 | M | Medium | BLOCKED | backend/G22 route-artifact transfer |
| 297 | [Commit Inventory Quantities and Stock History Atomically](./297-commit-inventory-stock-adjustments-atomically.md) | P0 | L | High | BLOCKED | Plans 154/163 plus Finance/Inventory and database/type transfer |
| 298 | [Pin Remote GitHub Actions to Immutable SHAs](./298-pin-github-actions-to-immutable-shas.md) | P0 | M | Low-Medium | BLOCKED | Plans 220/236/292 plus CI/release workflow transfer |
| 299 | [Characterize the Public Image-Generation Boundary](./299-characterize-image-generation-boundary.md) | P1 | M | Low | TODO | adjacent AI Studio metering review |
| 300 | [Commit Workspace Role Definitions Atomically](./300-commit-workspace-role-definitions-atomically.md) | P0 | M | Medium-High | BLOCKED | Plan 154/163 plus G22 and database/type transfer |
| 301 | [Make Calendar Event Deletion Recoverable](./301-make-calendar-event-deletion-recoverable.md) | P0 | L | High | BLOCKED | Plan 086, Plan 154/163, and database/type transfer |
| 302 | [Make Forms Response Exports Complete and Bounded](./302-make-forms-response-exports-complete.md) | P1 | L | Medium | BLOCKED | Forms and database/type transfer after Plan 154/163 |
| 303 | [Authenticate Public Agent Invocations Once](./303-authenticate-public-agent-invocations-once.md) | P0 | M | Low-Medium | TODO | adjacent AI Studio public-auth and metering review |
| 304 | [Declare UI's Runtime Types Dependency](./304-declare-ui-types-runtime-dependency.md) | P1 | S | Low | BLOCKED | Plans 124/236 plus UI smoke and Mail lockfile transfer |
| 305 | [Make Calendar Provider Updates and Moves Recoverable](./305-make-calendar-event-updates-recoverable.md) | P0 | L | High | BLOCKED | Plans 086/301 plus Calendar and database/type transfer |
| 306 | [Page and Aggregate the Forms Dashboard at the Data Source](./306-page-and-aggregate-forms-dashboard.md) | P1 | L | Medium | BLOCKED | Plans 111/302 plus Forms and database/type transfer |
| 307 | [Pin Privileged and Production Container Images by Digest](./307-pin-production-container-images-by-digest.md) | P0 | M | Medium | BLOCKED | Plan 298 plus native CI/cache and Forms release-test transfer |
| 308 | [Make Calendar Event Creation Idempotent and Recoverable](./308-make-calendar-event-creation-recoverable.md) | P0 | L | High | BLOCKED | Plans 086/154/163/305 plus Calendar and database/type transfer |
| 309 | [Validate Task Progress Imports Set-Wise](./309-batch-task-progress-import-validation.md) | P1 | M | Medium | BLOCKED | Plans 154/163 plus Tasks and database/type transfer |
| 310 | [Pin Production Dockerfile Base Images by Digest](./310-pin-production-dockerfile-bases-by-digest.md) | P0 | M | Medium | BLOCKED | Plan 307 plus native CI/cache and Forms path transfer |
| 311 | [Pin and Verify the Rust Worker Build CLI](./311-pin-rust-worker-build-cli.md) | P1 | S | Low-Medium | BLOCKED | Plan 008 plus native CI/cache workflow transfer |
| 312 | [Make Calendar Outbound Sync Replay-Safe](./312-make-calendar-outbound-sync-replay-safe.md) | P0 | L | High | BLOCKED | Plans 115/154/163/305/308 plus Calendar and database/type transfer |
| 313 | [Make Managed External-Project Builds Reproducible](./313-make-managed-project-builds-reproducible.md) | P0 | M | Medium | BLOCKED | Richfield external-project control-plane transfer |
| 314 | [Characterize the Public Speech-Execution Boundary](./314-characterize-public-speech-execution.md) | P1 | M | Low | TODO | adjacent AI Studio metering review |
| 315 | [Page Microsoft Calendar Events Before Absence-Based Deletion](./315-page-microsoft-calendar-events-before-deletion.md) | P0 | M | Medium-High | BLOCKED | Plans 115/312 plus Calendar sync-route transfer |
| 316 | [Characterize Nova Challenge-Manager Mutations](./316-characterize-nova-challenge-manager-mutations.md) | P1 | M | Low | TODO | adjacent Plan 013 coordination |
| 317 | [Retire Duplicate Web External-AI Execution](./317-retire-duplicate-web-external-ai-execution.md) | P1 | M | Medium-High | BLOCKED | Plans 167/293/299/303/314 plus AI/G22 transfer and consumer disposition |
| 318 | [Reconcile Hive Access Across Both Member Stores](./318-reconcile-hive-access-stores.md) | P0 | M | Medium | TODO | Hive runtime/cron operator coordination |
| 319 | [Single-Source Governed npm Package Releases](./319-single-source-npm-release-workflows.md) | P1 | L | Medium-High | BLOCKED | Plans 236/292/298 plus Forms/release/CI transfer |
| 320 | [Require Expiry for Drive Export Capabilities](./320-expire-drive-export-capabilities.md) | P0 | M | Medium | BLOCKED | backend migration ownership transfer |
| 321 | [Retire Crawler-Backed Pipelines and Queues](./321-retire-crawler-backed-pipelines-queues.md) | P1 | M | Low | BLOCKED | G22 TanStack migration-artifact transfer |
| 322 | [Preserve a Mailbox Owner During Membership Mutations](./322-preserve-mailbox-owner.md) | P0 | M | Medium | BLOCKED | Plan 154 green, Plan 163, and Mail/database/type transfer |
| 323 | [Aggregate Mail Bootstrap Unread Counts Set-Wise](./323-aggregate-mail-unread-counts.md) | P1 | M | Medium | BLOCKED | Plan 322 plus Plan 154/163 and Mail/database/type transfer |
| 324 | [Bind Workspace Summary Actions to the Authenticated Actor](./324-bind-workspace-summary-actions-to-actor.md) | P0 | M | Medium | BLOCKED | G22 route-artifact transfer plus Web/Hive coordination |
| 325 | [Commit External-App Secret Rotation Atomically](./325-commit-external-app-secret-rotation-atomically.md) | P0 | M | Medium | BLOCKED | Plan 154 green, Plan 163, and database/type transfer |
| 326 | [Page Mailbox Members and Batch Their Profiles](./326-page-mailbox-members-and-batch-profiles.md) | P1 | M | Low-Medium | BLOCKED | Plan 322 plus Mail/internal-api transfer |
| 327 | [Require Calendar Management Permission for Connection Administration](./327-require-calendar-connection-permission.md) | P0 | M | Medium | BLOCKED | Plans 086/154/163 plus Calendar/backend/database transfer |
| 328 | [Make Workspace AI Models Truthfully Read-Only](./328-make-workspace-ai-models-read-only.md) | P0 | S | Low-Medium | TODO | no active exact-path owner |
| 329 | [Characterize Cross-App Token Issuance at the HTTP Boundary](./329-characterize-cross-app-token-issuance.md) | P1 | S | Low | TODO | no active exact-path owner |
| 330 | [Make Cron Execution History Truthfully Read-Only](./330-make-cron-execution-history-read-only.md) | P2 | S | Low | BLOCKED | cron/frontend handoff exact-path transfer |

Plan 131 is DONE on its reviewed documentation commit. Plans 136 and 138 have
reviewed retained implementations but remain blocked by their mandatory app
builds. Resume blocked work only after its recorded blocker clears; do not
reimplement a retained reviewed worktree. `BLOCKED` is a
coordination state, not permission to work around an active owner. Valid states
are `TODO`, `IN PROGRESS`, `BLOCKED`, `DONE`, `REJECTED`, and `SUPERSEDED`.

## Dependency and ownership notes

- Plans 036 and 056 follow Plan 032; Plan 037 follows Plan 036. Plan 043 follows
  Plans 057/154/163 so its member/object policies and isolated database baseline
  are settled before metric RLS/default work. Plans 068 and 069 follow Plan 066. Plan 073 follows Plan 072. Plan
  075 follows Plan 074. Plan 091 follows Plan 014. Plan 105 follows Plan 086.
  Plan 115 follows Plans 031 and 086 so it can reuse the settled Calendar
  permission and canonical-sync contracts. Its refreshed contract also derives
  cron/cooldown treatment only from verified cron authentication, never caller
  JSON.
- Plans touching Web-to-TanStack route artifacts remain blocked while the G22
  lane owns `route-overrides.json` and `route-manifest.json`; this includes
  Plans 001, 002, 015, 020, 033, 035, 040, 041, 050, 051, 054, 061, 062, 066,
  068, 069, 081, 092, 095, 099, 102, and 104. Plan 020 also needs a refreshed
  TypeScript/Rust Devbox parity matrix before execution.
- Mail ownership blocks Plans 009, 065, 070, 074, 093, 094, 101, and the Mail
  half of 097. Contacts ownership blocks Plans 073 and 096. Broad Tasks ownership
  blocks Plans 010, 076, and 082. Finance/Inventory ownership blocks Plans 087
  and 106.
- Plans 083, 084, and 096 require migration/generated-type ownership transfer.
  Plan 098 requires an explicit multi-owner consolidation lane rather than
  opportunistic edits across eleven runtimes.
- Plans 022, 030, 032, 037, 038, 046, 057, 058, and 059 are also blocked by
  active generated database type ownership. Plans 003 and 019 must wait for the
  Mail-owned lockfile; Plan 003 additionally overlaps the release lifecycle.
- Plan 100 is blocked by the active Richfield external-CMS lane and generated
  database type owners. Plan 101 requires one coordinated transfer across the
  Calendar, Tasks, and Finance/Inventory encryption facades plus the Mail-owned
  lockfile. Plan 102 also
  requires the backend migration owner because the Rust route already exists.
- Plan 103 is blocked by the canonical cron/frontend handoff that explicitly
  owns the cron-job DELETE follow-up; test-only scope does not bypass ownership.
- Plan 104 also needs the G22 route artifacts after its Chat route fix. Plan 105
  follows Plan 086 so both Calendar APIs reuse one permission guard. Plan 106
  remains blocked on the exact Inventory state-machine and generated-type owners.
  Plan 108 requires a coordinated Calendar/Tasks/Web extraction plus the lockfile.
- Plan 109 is blocked by the active Richfield external-project lane, G22 route
  artifacts, and generated migration/type owners. Plan 111 promotes the previously deferred
  Forms pagination item but remains blocked by the nonterminal Forms handoff.
  Plan 110 is DONE on its reviewed Hive atomic-materialization commit. Plan 112
  has a reviewed retained worktree but remains blocked by the mandatory Tasks
  Turbopack worker gate.
- Plan 114 is blocked by the Forms satellite `handoff`, which claims
  all of `apps/forms/**`. Plan 116 requires generated-type owners to release or
  transfer their paths; the canonical-`done` education note is not an active
  owner. Plans 113 and 120 are DONE on reviewed commits; Plan 117's reviewed
  deletion worktree remains blocked by the mandatory Web build session.
- Plan 118 requires a coordinated transfer across the copied Web/satellite auth
  engines; changing only the shared lookup would leave 64 resolver-backed routes
  outside suspension enforcement. Plan 119 remains blocked by the Pay-wide
  handoff and generated migration/type ownership. Plan 121 must wait for the
  connected-onboarding owner before changing the canonical onboarding boundary.
- Plan 122 is DONE and its shipped audit reports lifecycle debt read-only
  without editing or archiving another agent's coordination note.
- Plans 123, 125, 126, and 127 are DONE on reviewed commits. Plan 124 follows
  completed Plan 123 but remains
  blocked until the Mail handoff releases `bun.lock`; its package-manifest
  changes must be made through Bun rather than manual dependency edits.
- Plan 128 is blocked by the canonically `working` Finance/Inventory owner and
  generated migration/type owners. Plans 129 and 130 are blocked by the active
  CMS redesign and Richfield CMS lanes plus Finance/Inventory and generated
  database artifacts; Plan 130 additionally needs the internal-api owner.
  Plan 131 is DONE on its reviewed documentation commit.
- Plan 132 is blocked by the working member-invite satellite-auth lane and the
  G22-owned TanStack migration artifacts required for a changed Web route.
  Plan 133 must wait for the Mail-owned lockfile; Plan 134 follows Plan 133 so
  lifecycle behavior lands on characterized, root-discovered transports.
  Plan 135 is blocked by the canonically working Finance/Inventory lane and
  generated migration/type owners. Plan 136 has a reviewed retained Calendar
  settings implementation but remains blocked by its mandatory production
  build.
- Plan 137 must wait for the top-level education-extraction ownership note to be
  canonically archived/resolved or transfer its exact Teach paths. Plan 138 has
  a reviewed retained security fix but remains blocked by its mandatory Tasks
  production build. Plans 139 and 140 must wait for the
  canonically working Finance/Inventory owner; Plan 139 additionally needs
  Contacts/users-core and migration/generated-type transfers.
- Plan 141 has a retained implementation with 38 passing focused tests but is
  blocked after its mandatory Tasks typecheck failed twice on new-test builder
  typing. Plan 142
  follows Plan 071's reviewed atomic description-persistence contract and must
  not copy the old split-write behavior while that retained worktree is blocked.
  Plan 143 is blocked by the working Finance/Inventory owner plus migration and
  generated-type ownership. Plan 144 is DONE on its reviewed source-size
  ratchet commit.
- Plan 145 has a reviewed retained implementation that must be replayed atop
  Plan 151's disposable-validator base; its focused route work is green, while
  the mandatory full exact-base pgTAP baseline remains red. Plan 146
  must wait for migration/type owners before
  adding the transactional bonus-adjustment RPC. Plan 147 must wait for the
  top-level education-extraction note to be canonically archived or transfer
  its exact Teach paths, plus database/type ownership. Plan 148 must wait for
  the Forms lane to transfer `release-workflows.test.js` and for external JSR
  consumer disposition.
- Plan 149 must coordinate the shared Track request/session state machine and
  wait for migration/generated-type ownership. Plan 150's exact-base database
  history blocker was removed by Plan 151, which is DONE on reviewed commit
  `132a9e3ebb`. Plan 150's focused route/policy work is retained, but its full
  isolated pgTAP gate failed twice on five unrelated exact-base suites. Plan
  152 is DONE on reviewed commit `f2c74af4b2`. Plan 153 must
  keep the live Web and existing Rust
  dataset GET handlers in parity and therefore waits for backend, G22
  route-manifest, and internal-api ownership transfers.
- Plan 154 promotes the known exact-base database-suite blocker into explicit
  repair work, but must coordinate the active external-AI and Inventory
  database lanes, conditional generated types, and education note before
  changing the five failing suites. Plan 155 is blocked by the
  Pay-wide migration handoff that owns the receipt route and UI.
- Plan 156 must change both Track and live Web plus one atomic database
  invariant, so it waits for G22 route artifacts and migration/type ownership.
  Plan 157 must not edit the root manifest until the Forms handoff transfers it
  and the completed Hive/Mind note is canonically archived or narrowed.
- Plan 158 follows Plans 154, 161, and 163 and requires one coordinated
  Contacts/users-core, backend/G22 route-artifact, and database/type ownership lane because removing the
  unsafe Web compatibility surface without tightening direct table access
  would leave the same permission bypass available.
- Plan 159 is the schema-free synchronous fail-closed slice. It must coordinate
  the destructive Web route with the Pay owner, preserve every local
  reconciliation row until all provider revocations succeed, and update the
  G22-owned route artifact without adding a deletion-state migration.
- Plan 160 follows Plans 154 and 163 and must resolve the completed-but-unarchived Tasks
  auth note plus migration/type ownership before adding its private atomic RPC.
- Plan 161 is blocked by the active G22/backend migration lane and other owners
  of the shared route artifacts. Plan 162 is DONE on reviewed commit
  `22c96a18ef`, built from Plan 004's script-discovery base. Plan 163 is DONE on
  reviewed commit `3f61e928ea`, built from Plan 151's validator base, and
  closes the isolated-typegen prerequisite for Plans 158 and 160.
- Plan 164 follows Plan 154 and requires the backend/database owners so the
  live Infrastructure routes, prepared Rust handler, and direct RLS boundary
  move from read/membership authorization to one mutation permission together.
- Plan 165 must wait for the daily-report handoff that owns its users-core
  report helpers and Contacts report-view tests. Plan 166 must wait for both the
  Contacts users/database handoff and G22's route artifacts because Web
  re-exports the shared handler; neither plan may reinterpret a handoff as stale
  merely because its shipped runtime work is already on main.
- Plan 167 follows the green database baseline in Plan 154 and the disposable
  typegen foundation in completed Plan 163. It also requires exact transfer
  from the CS35 gateway/external-AI lane for the shared public metering boundary
  plus database/generated-type ownership.
- Plan 168 must move the import POST first-class and therefore waits for G22's
  route artifacts as well as database/generated-type ownership. Plan 169 is
  schema-free but still waits for G22 because moving its substantially reworked
  legacy handler changes the generated route manifest.
- Plan 170 follows the green database baseline in Plan 154 and requires the
  active Finance/Inventory database lane to transfer its migration/test paths;
  no supported runtime caller currently justifies direct authenticated access.
  Plan 171 also follows Plan 154 and must classify every education, Finance,
  utility, and future-Rust caller before narrowing self-repair and bulk repair.
- Plan 172 follows Plans 154 and 163 and needs one coordinated G22,
  database/generated-type, internal-api/UI, and bilingual message-bundle lane.
  It must expose provider ambiguity rather than claiming exactly-once email.
- Plan 173 must wait for backend/G22 provenance ownership and canonical
  disposition of the noncanonical cron-runner plus cron/frontend monitoring
  notes. Plan 174 stopped before worktree creation because the active Inventory
  revenue-bundles handoff owns its required Infrastructure inventory subtree;
  after transfer, land it before Plan 095 or ensure Plan 095 consumes only the
  canonical Storage Core file.
- Plan 175 follows the green exact-base database baseline in Plan 154 and the
  completed isolated-typegen contract in Plan 163, and needs
  one coordinated Tasks/database lane so direct table policies match the
  maintained member/share access helper. Plan 176 additionally follows Plan
  082 because both touch board-template creation and uses Plan 163 for its
  generated-type gate; it must retire the generic destructive background
  endpoint without restoring a direct table bypass.
- Plan 177 follows Plans 154 and 163 and requires the external-AI/database
  owners before changing the six current execution-analytics RPC ACLs. Plan 178 follows Plans
  154 and 163 and must wait for the canonical Finance/Inventory owner before
  replacing listing persistence and provider-sync orchestration.
- Plan 179 is source-deletion work in Web but must relocate its only focused
  test into the Finance-owned canonical tree, so the canonically working
  Finance/Inventory note must be resolved or transfer those exact test paths
  first.
- Plans 180-184 all require the green exact-base database baseline from Plan
  154 and isolated type generation from Plan 163. Plan 180 additionally needs
  the broad Tasks/database lane; Plan 181 needs backend/G22 parity ownership;
  Plan 182 must coordinate removal with connected onboarding; Plan 183 needs
  Contacts/education policy ownership plus backend/G22 review of caller-token
  exports; and Plan 184 needs the canonically working Finance/Inventory owner
  to transfer its database boundary plus the same backend/G22 review.
- Plans 185-189 all follow the green exact-base database baseline in Plan 154;
  Plans 188-189 also use Plan 163's completed isolated type-generation contract.
  Plan 185 needs Tasks/database transfer and must prove the existing pg_cron
  execution role before narrowing ACLs. Plan 186 needs database ownership plus
  Infrastructure/backend review of the trusted aggregation boundary. Plan 187
  waits for the canonically working Finance/Inventory database owner. Plan 188
  needs Contacts/education and database/type transfer plus backend/G22 review
  of caller-token reads. Plan 189 additionally needs G22 ownership of the Web
  route overrides/manifest and backend review while keeping live Web authority.
- Plans 190-193 also follow the green exact-base database baseline in Plan 154.
  Plan 190 needs Track/time-tracking and database transfer before narrowing the
  three service-backed mutation helpers. Plans 191-192 need the canonically
  working Finance/Inventory owner; Plan 191 needs G19 invoice-analytics review,
  while Plan 192 needs the G20 wallets/transactions backend owner and preserves
  both caller-token and service-role modes. Plan 193 additionally uses completed
  Plan 163 for isolated type generation and needs Track/database transfer plus G22 review of the
  caller-token root export. Plan 194 is DONE at reviewed commit `e539356d39`,
  executed from Plan 004's automatic script-discovery base.
- Plans 195-196 require Plan 154's green full isolated pgTAP baseline and use
  Plan 163's completed isolated type-generation base. Plan 196 also waits for
  Plan 146's migration/generated-type ownership transfer. Plan 197 is DONE at
  reviewed commit `9747845aae`, preserving the documented Contacts hard
  cutover rather than reversing it.
- Plans 198-200 require Plan 154's green database baseline and execute from
  completed Plan 163. Plan 198 needs the Contacts/database merge boundary;
  Plans 199-200 need one Tasks/database/generated-type lane. Plan 201 follows
  Plans 173 and 174 so its reachability proof is run only after the last Web
  importer is removed and Infrastructure uses the canonical storage provider.
- Plans 202-204 require Plan 154's green database baseline and Plan 163's
  completed isolated type generation. Plan 202 needs database/Infrastructure
  ownership; Plan 203 additionally needs the daily-report lane and backend
  service-role review; Plan 204 waits for the active cron/frontend handoff plus
  database/type ownership. Plan 205 has no exact active owner, but its retained
  implementation stopped after Infrastructure typecheck failed twice on a
  test-only `it.each` inference error; focused tests and source-size gates pass.
  Plan 206 executes from reviewed Plan 197 but waits for
  TanStack and Mail-owned lockfile transfer before pruning dependencies.
- Plan 207 follows the green Plan 154 database baseline and completed Plan 163,
  and needs database/type transfer plus review from the active AI metering lane;
  it is distinct from Plan 177's execution-analytics overloads. Plan 208 has a
  retained exact-base deletion worktree; reachability, the reviewed Tasks
  Vitest alias/stub, 16 focused tests, and both typechecks are green. Reviewed
  Plan 216's final corrective commit `3a09b070ab`, integrated in verified main
  `cdef1c5533`, removed the former base build blocker, so transplant only the
  retained scoped diff into a fresh worktree at that main and run
  the remaining gates. Plan 209 needs one coordinated G22/backend,
  database/type, Web settings/internal-api, and Mobile contract lane because it
  replaces an unversioned array response across every known client. Plan 210
  follows Plans 154/163 and needs only the database/type boundary in addition
  to its currently unclaimed Infrastructure route.
- Plans 211-213 require the green Plan 154 database baseline and completed Plan
  163. Plan 211 additionally needs G22 route artifacts and a narrow Tasks
  authorization review because canonical email grants board-share access. Plan
  212 needs G22/database ownership for first-class API-key routes and the
  composite tenant invariant. Plan 213 needs G22/database review for the moved
  Web cron route and transactional snapshot RPC. Plans 214 and 215 have no
  active exact-path owner. Plan 214's retained deletion passed focused tests and
  typechecks; verified integrated Plan 216 removed its former base build blocker,
  so it is ready for retained-worktree replay and remaining gates.
  Plan 215's exact retained deletion passed focused tests/typecheck; a later
  exact-main release build passed, so it is now TODO for retained-worktree
  replay atop `cdef1c5533`.
- Plan 216 is DONE at final corrective commit `3a09b070ab`, integrated in
  verified main `cdef1c5533`: request configuration no longer imports the
  Server-Component-only `next/root-params`, prerender candidates fall back to
  each app's configured default, and actual locale roots remain strict.
  Retained Plans 208/214/215 are TODO and must use their documented scoped-patch
  transplant into fresh worktrees at that main rather than rebase divergent
  dirty worktrees or reimplement the fix. Plan 217 waits for the canonically working
  Finance/Inventory owner to transfer the exact Inventory compatibility route.
- Plan 218 requires the green Plan 154 database baseline and completed Plan 163
  isolated typegen base, plus one Tasks/database/type ownership lane. Plan 219
  waits for Forms to transfer root `package.json` and Mail to transfer
  `bun.lock`.
- Plan 220 waits for the active release auto-merge handoff to transfer the
  workflow and focused tests and for the stale top-level done note on the same
  paths to be archived. Plan 221 waits for the nonterminal Forms handoff. Plan
  222 needs only Mail's lockfile transfer. Plan 223 is unowned and executable.
- Plans 224-225 are unowned and executable; Plan 225 should coordinate but stay
  separate from Plans 031/115, and its old canonical-done migration note needs
  archival only as lifecycle hygiene. Plans 226-227 require the green Plan 154
  database baseline, completed Plan 163 isolated typegen base, and exact-path
  transfer from the active Zalo external-chat handoff; do not execute their
  migrations concurrently. Plan 228 needs Mail's lockfile transfer and Pay's
  exact payment-core transfer for the host-owned billing adapter.
- Plan 229 needs the green Plan 154 baseline, completed Plan 163 typegen base,
  and exact application/migration transfer from both active Inventory owners.
  Plan 230 follows Plan 146 because both modify the balance route and also needs
  Plans 154/163. Plan 231 is unowned and executable after adjacent AI-policy
  coordination. Plan 232 waits for an explicit public/private ownership
  decision plus Pay/Forms release-path transfer; registry evidence alone does
  not authorize either branch.
- Plan 233 requires the green Plan 154 database baseline and completed Plan 163
  typegen base, and must coordinate its event/junction migration with Plan 086.
  Plan 237 follows Plan 233 so the explicit-empty and source-validation
  contracts are settled before destructive cleanup changes.
- Plan 234 needs both active Inventory owners to transfer the referral route and
  migration paths. Plan 235 has no exact runtime owner, but still waits for the
  database/type lane and must preserve the Infrastructure authority established
  by Plans 173/174/201.
- Plan 236 is one shared release prerequisite/extension: do not edit its
  readiness/workflow surfaces in parallel with Plans 228/232 or the nonterminal
  Forms/Pay release lanes.
- Plans 238 and 241 require the nonterminal Forms handoff to transfer its exact
  application paths; Plan 241 additionally follows Plan 238 so workspace
  containment is settled before the save transaction, and it needs the green
  Plan 154 baseline plus completed Plan 163 typegen contract.
- Plan 239 has no active exact-path owner, but must coordinate its shared
  board-access helper with adjacent Tasks work. It separates share/public-link
  administration from generic board edit access and does not reopen Plan 076's
  content-edit contract.
- Plan 240 executes from reviewed Plan 090 commit `ce6a148ac8` (or an exact
  integrated descendant) so criteria reads reuse the canonical Nova catalog
  actor model rather than inventing another role matrix.
- Plan 242 waits for the canonically working Finance/Inventory handoff plus the
  Plan 154/163 database/type foundation; its audit insert is part of the sale
  transaction and must not be implemented concurrently with other invoice or
  Inventory-audit persistence changes.
- Plan 243 needs the Plan 154/163 database/type foundation, the G22 route
  artifacts, and the maintained Contacts submission client in one lane. Its
  durable claim must precede provider dispatch; database failure after provider
  acceptance is an explicit ambiguous state, never an automatic resend.
- Plan 244 follows Plan 242 so both invoice modes reuse one settled relation,
  pricing, promotion, and stock contract without competing migrations. It also
  waits for the working Finance/Inventory and database/type owners.
- Plan 245 executes from the completed Plan 163 isolated-validator base after
  Plan 154 is green and requires G22/backend artifact transfer for OpenAPI and
  migration-manifest parity. Do not preserve a raw-array compatibility branch
  by silently draining pages.
- Plan 246 follows Plans 228/236 and Mail's lockfile transfer so the APIs
  manifest and exact installed-tarball smoke change together. Plan 247 waits
  for the G22 manifest/docs lane and native-CI workflow lane; its checks are
  read-only and must not regenerate tracked artifacts.
- Plan 248 executes from the completed Plan 163 isolated-validator base only
  after Plan 154 is green and database/type ownership transfers. The canonical
  Meet migration note is `done`, so it is coordination history rather than an
  ownership lock.
- Plan 249 also waits for the working Finance/Inventory and Inventory revenue-
  bundle handoffs before introducing its durable Polar repair job. Plan 250
  requires one coordinated extraction from the daily-report queue owner, the
  Mail-owned lockfile, and G22's generated route manifest; it must not preserve
  either app-local queue engine as a compatibility implementation.
- Plans 251-252 both require exact transfer from the nonterminal Pay migration
  handoff. Plan 251 fails closed on unavailable provider/database evidence
  before subscription create/revoke; Plan 252 keeps the summary DB-only while
  preserving seat fetching for full billing callers.
- Plan 253 has no active exact-path owner and consolidates only the two live
  TypeScript policy copies; Rust remains verification-only and any semantic
  parity change requires backend/G22 transfer. Plan 254 is docs/test-only and
  executable after confirming no approved TanStack/Rust cutover has landed.
- Plan 255 executes only after the Finance/Inventory and SePay handoffs plus the
  database/type lane transfer. It keeps both local callback tokens live until
  the exact remote webhook URL is verified and makes ambiguous provider
  outcomes reconcilable rather than blindly retrying.
- Plan 256 needs the Plan 154/163 database/type foundation but has no active
  exact runtime-path owner. Plan 257 is schema-free and otherwise ready; the
  plans own disjoint files but change adjacent recovery contracts, so sequence
  and rebase them without merging their scopes.
- Plan 258 requires the nonterminal Inventory migration handoff to transfer the
  three compatibility collection routes. It preserves their maintained Mobile
  clients and prepared Rust GET-only fallthrough while closing POST bodies.
- Plan 259 follows the green Plan 154 baseline and completed Plan 163, needs
  Tasks/database/generated-type, Mobile, and backend/G22 coordination, and must
  sequence its My Tasks query edits with Plan 079's retained client-fan-out work.
- Plan 260 must classify and transfer every deprecated browser-client caller;
  finish or rebase overlapping Plans 026, 079, and 259 before their exact
  Rewise/Tasks paths move. Strict-by-default activation is the final step, not
  a shortcut around unfinished caller migration.
- Plan 261 follows Plan 057, executes from completed Plan 163 only after Plan
  154 is green, and needs Tasks/database/type transfer. It keeps ordinary
  creation and dedicated self join/leave while closing roster/team
  administration and direct authenticated writes without reopening Plan 057's
  leaderboard item contract.
- Plan 262 needs exact transfer from the Mail handoff before changing its draft
  attachment route. Plan 263 is unowned but must coordinate with the adjacent
  Tasks lane; it preserves one request and trigger per task while bounding only
  independent client orchestration.
- Plan 264 follows Plan 236 so the exact prepared-tarball smoke is extended in
  one lane, and waits for Mail's `bun.lock` transfer. It changes only the Utils
  host-runtime manifest contract, not framework behavior or exports.
- Plan 265 is a narrow unowned log-privacy deletion. It does not overlap Plan
  245's Task-note pagination contract and must not become a broader legacy-route
  rework without the first-class route migration duties.
- Plan 266 follows Plan 009, requires Plan 154 to become green, uses the
  completed Plan 163 database foundation, and waits for the Mail/database/type
  owners. It atomically commits the inbound message graph after authenticity,
  rather than changing SES/S3 verification itself.
- Plan 267 executes from completed Plan 163 only after Plan 154 becomes green
  and the database/type plus adjacent user-group paths transfer. It preserves
  recurrence dates and single-session behavior while replacing only series-wide
  relation fan-out.
- Plan 268 waits for the Forms handoff's exact root `package.json` transfer and
  changes no Flutter dependency or lockfile. Plan 269 first requires provenance
  and disposition of the already-dirty `bunfig.toml`, plus native-CI test-path
  transfer; it treats `bun.lock` as read-only evidence.
- Plan 270 follows the completed Plan 163 database foundation only after Plan
  154 is green, and coordinates its global mutation permission with Plan 017's
  reviewed Infrastructure pattern plus backend/G22 owners. Plan 271 is a
  schema-free localized adapter fix but waits for the Zalo exact-path transfer.
- Plan 272 requires the Mail handoff and database/type lane before replacing
  rich thread hydration with a service-role-only compact context RPC. Plan 273
  is test-only and leaves the generated legacy route wrappers unchanged.
- Plan 274 requires one coordinated transfer across Finance/Inventory, Teach,
  Contacts, Mail's lockfile, and the E2E workflow/helper lanes. Destination
  tests must pass before Web skips are deleted; live Web API/cron cases remain.
- Plan 275 requires the active Inventory owner to transfer the compatibility
  supplier item route and should land with or after Plan 258 so their adjacent
  collection/item body contracts do not drift.
- Plan 276 requires G22's route artifacts before moving the settings handler
  first-class, and must classify the maintained Contacts guest-lead and
  Inventory referral-settings callers before closing the shared table body.
  Sequence any referral contract work with Plan 234 rather than restoring a
  second referral writer.
- Plan 277 executes from completed Plan 163 only after Plan 154 is green and
  the migration/test/generated-type paths transfer. Its Infrastructure runtime
  paths are otherwise unowned; the private directory RPC must stay
  service-role-only.
- Plan 278 waits for the Forms handoff's exact root `package.json` transfer and
  relies on Plan 004's automatic script discovery. It must not modify or
  regenerate `bun.lock`.
- Plan 279 is unowned and executable. Real target cleanup remains forbidden
  during verification; only report mode and disposable fixtures may run.
- Plan 280 waits for the active Finance/Inventory handoff to transfer Square
  reconciliation and route paths. Durable pending entries count as settled;
  returned recorder errors and partial won-dispute pairs must not acknowledge.
- Plan 281 follows or lands with Plans 258/275 so all supplier compatibility
  edits share one resolved-workspace and closed-body contract. The prepared
  Rust GET is parity evidence and should not be changed without backend review.
- Plan 282 requires G22's 25 Web route artifacts and Mail's lockfile transfer.
  It first applies the completed Track fixes to Web, then extracts one core;
  adapters may differ only in actor/session plumbing.
- Plan 283 needs the Rust/OpenAPI changelog lane. Collection and detail types
  must remain distinct, and the public TanStack page must not silently drain
  every bounded page.
- Plan 284 is unowned test characterization. It must use fake provider/database
  seams only and must report, not silently fix, any post-mint ambiguous failure.
- Plan 285 waits for Finance/Inventory and database/type transfer. Its payload
  hash guarantees exact-file replay only; it must not claim cross-file Money
  Lover account deduplication without a stable reviewed account namespace.
- Plan 286 waits for the green Plan 154 baseline and database/type transfer; it
  authorizes Contacts once and keeps the six existing count predicates exact.
- Plan 287 waits for database/type and adjacent mobile-deployment authority. A
  successful issue must not depend on a fallible post-commit read before the
  one-time plaintext response.
- Plan 288 follows completed Plan 004 and is otherwise unowned. It converts only
  the Vitest harness, then discovers the existing database scripts directory.
- Plan 289 executes from completed Plan 163 only after Plan 154 is green and
  Finance/database/type owners transfer. Historical cross-workspace budget
  references require explicit operator disposition before constraints land.
- Plan 290 executes from completed Plan 163 only after Plan 154 is green and
  the AI Studio/database lanes transfer. Its page-first query must aggregate
  steps only for the bounded page and must not preserve false-zero fallbacks.
- Plan 291 follows Plan 236 and waits for Mail's lockfile plus active AI source
  review. Remove only proven phantom edges, moving any hoisted direct consumer
  to its owning manifest with Bun before changing the AI package.
- Plan 292 follows Plan 236 and waits for the Forms handoff to transfer the
  shared release-workflow test. Its five workflow edits remove only build-job
  production service credentials; publication and Turbo cache scopes remain.
- Plan 293 is available after adjacent AI Studio metering review. It changes no
  shared metering semantics and must reject every oversized request before any
  estimation, reservation, provider, capture, or settlement work.
- Plan 294 waits for the active Finance owner. It relies on the already
  validated invoice foreign-key actions and stops rather than inventing cleanup
  for any newly discovered restrictive or application-managed dependent.
- Plan 295 waits for the active Finance/Inventory owner and deliberately leaves
  stock settlement to Plan 297; it only closes the privileged product-field
  allowlist.
- Plan 296 requires G22/backend artifact transfer because the live Web PATCH
  already has prepared Rust parity and changed Web handlers must become
  first-class while their migration ownership is regenerated.
- Plan 297 requires Plans 154/163 and Inventory/database/type transfer because
  it adds the one transaction that owns both stock rows and movement history.
- Plan 298 follows the overlapping privileged-release plans and active CI
  owners; immutable pins must not be applied around unreviewed concurrent
  workflow edits.
- Plan 299 may proceed after adjacent AI Studio metering review without editing
  the currently owned shared public API helper.
- Plan 300 executes from completed Plan 163 only after Plan 154 is green and
  G22/database/type owners transfer the role mutation artifacts. Its composite
  tenant FK and atomic RPCs must land together; historical mismatches require
  operator disposition rather than silent cleanup.
- Plan 301 follows Plan 086 because both touch the Calendar event item route,
  then needs Plan 154/163 plus database/type transfer for durable deletion
  operations. Rust remains GET-only and must continue falling through DELETE.
- Plan 302 waits for the nonterminal Forms handoff and database/type lane. It
  separates complete exports from Plan 111's interactive response analytics;
  CSV streams the stable snapshot while oversized XLSX fails explicitly.
- Plan 303 is route/test-local and otherwise executable after adjacent CS35
  review. It must consume the existing public credential boundary without
  changing shared authentication, attribution, or metering semantics.
- Plan 304 follows the overlapping Plan 124 UI-manifest and Plan 236 tarball
  smoke work and waits for Mail's lockfile transfer. The dependency move must
  use Bun and requires no Finance source change.
- Plan 305 follows Plans 086 and 301 because all three change the Calendar item
  route. It gives PUT its own staged operation contract without silently
  widening the deletion-only state machine.
- Plan 306 sequences with Plans 111 and 302 because they share the Forms server
  query surface. Its bounded summary page must remain independent from response
  detail and export contracts.
- Plan 307 sequences after or rebases over Plan 298 and waits for both the
  native CI/cache handoff and Forms-owned shared release-workflow test because
  those paths must change atomically with the production image references.
- Plan 308 follows Plan 086's collection-route authorization work and shares
  provider identity/reconciliation primitives with Plan 305. Its POST operation
  record must remain distinct from the PUT and DELETE state machines.
- Plan 309 requires the green database baseline and Tasks/database/type
  transfer. It preserves the 500-entry public contract while replacing up to
  thousands of sequential validation reads with one tenant-validating RPC.
- Plan 310 follows Plan 307 so production Compose discovery and image-policy
  helpers have one authority. It governs external Dockerfile bases and frontend
  directives reached by production builds, not sidecar `image:` references.
- Plan 311 should land with or rebase over Plan 008's Rust workflow edit after
  the native CI/cache handoff transfers the file. It pins the installed Worker
  CLI without changing the Rust compiler or Cargo graph.
- Plan 312 follows the canonical sync authorization work and the Calendar
  provider-operation primitives from Plans 305/308. It gives background
  outbound creation its own durable per-event operation without conflating the
  interactive POST/PUT/DELETE state machines.
- Plan 313 waits for the working Richfield external-project control-plane lane.
  Its renderer stays pure and canonically tested; verification must not pull,
  build, or deploy an image.
- Plan 314 is route/test-local after adjacent AI Studio metering review. It
  freezes current speech reservation/provider/audio/settlement behavior without
  changing the shared public metering authority.
- Plan 315 follows Plans 115/312 because it changes the canonical sync route.
  The package helper may page independently, but absence-based deletion stays
  blocked until the route can consume an explicitly complete traversal.
- Plan 316 has no active exact-path owner and is test-first, but must coordinate
  with Plan 013's retained Nova role work rather than inventing a competing
  authorization helper or changing role semantics.
- Plan 317 waits for the canonical AI boundary plans, CS35/G22 transfer, and an
  operator-approved external-consumer inventory. Repository search alone is
  not sufficient evidence to delete externally callable Web endpoints.
- Plan 318 has no active exact-path owner: the historical Hive migration note
  is canonically `done`. Its code can proceed after Hive runtime review, but the
  plan cannot be marked DONE until the Docker-hosted reconciliation endpoint is
  registered in the approved managed scheduler.
- Plan 319 follows Plans 236/292/298 so it consolidates their final tarball,
  credential, and immutable-action contracts rather than refactoring stale
  copies. It also needs exact transfer of the Forms-owned shared release test
  and every affected release/CI workflow.
- Plan 320 changes the prepared Rust parity handler as well as the live shared
  TypeScript authority, so it waits for exact backend migration transfer; it
  must not imply that Rust currently serves production traffic.
- Plan 321 keeps both legacy URLs as redirects and requires G22 transfer before
  regenerating coordinator-owned TanStack overrides, manifest, or route tree.
- Plan 322 waits for the exact-base database gate and Mail/database/type
  transfer before enforcing owner preservation transactionally.
- Plan 323 sequences after Plan 322 because both change the Mail migration,
  pgTAP, and generated-type lane; its performance contract is otherwise
  independent.
- Plan 324 removes caller-selected identity from the Server Action and moves the
  changed Web route first-class; G22 must transfer its override/manifest before
  regeneration, while Web/Hive retain their existing verified actor gates.
- Plan 325 waits for the exact-base database gate and migration/type ownership
  before replacing external-app field deletion/insertion with one locked RPC.
- Plan 326 follows Plan 322 because both edit Mail membership repository/routes;
  it additionally needs the active Mail/internal-api handoff to transfer.
- Plan 327 follows Plan 086 and the Plan 154/163 database/type foundation so
  Calendar connections reuse the same actor-aware permission guard; it also
  needs exact backend and database transfer because the prepared Rust GET and
  direct RLS boundary must change together.
- Plan 328 is an unowned read-only UI correction. It preserves the registered
  Models list route and removes only wrong-domain mutations and nonexistent
  detail actions, so aggregate migration artifacts stay unchanged.
- Plan 329 is strictly characterization-only and unowned. Any runtime policy
  decision about target apps or expiry bounds must become a separate plan.
- Plan 330 waits for the nonterminal cron/frontend handoff to transfer both
  execution-history consumers and their shared columns before dead copies are
  removed.

## Latest audit additions

- **Calendar connection authorization:** Plan 327 aligns every connection
  method, the prepared Rust GET, and direct RLS with `manage_calendar` rather
  than ordinary workspace membership.
- **Truthful read-only surfaces:** Plans 328 and 330 remove wrong-domain user
  mutations, nonexistent detail links, and dead copied actions from workspace
  Models and Cron execution history without inventing unsupported CRUD.
- **Cross-app credential coverage:** Plan 329 characterizes authentication,
  forwarding, error mapping, and the shared issuer with synthetic tokens and
  no runtime changes.
- **Workspace-summary actor binding:** Plan 324 splits the injectable
  server-only aggregation from the public Server Action so serialized caller
  input can no longer select another user's service-role workspace directory.
- **External-app credential settlement:** Plan 325 atomically replaces registry
  fields and returns committed rows without a fallible post-rotation read,
  while explicitly retaining honest transport-loss semantics.
- **Mailbox member directory scaling:** Plan 326 cursor-pages membership rows,
  bulk-loads both profile tables, and changes the settings UI to bounded manual
  page loading.
- **Drive export capability expiry:** Plan 320 replaces the TypeScript/Rust
  fail-open TTL with one finite default and strict bounded configuration while
  preserving the bearer token and downstream signed-URL formats.
- **False workflow products:** Plan 321 removes Pipelines/Queues navigation and
  redirects their crawler-backed copies to canonical Crawlers instead of
  inventing unsupported semantics.
- **Mailbox owner lifecycle:** Plan 322 serializes member mutations and freezes
  owner/admin rules so no request or concurrent pair can leave a mailbox
  ownerless.
- **Mail bootstrap scaling:** Plan 323 replaces per-mailbox state scans/counts
  with one bounded service-role-only grouped unread-count operation.
- **Task Progress metric authority:** refreshed Plan 043 preserves member reads
  while requiring `manage_projects` through cookie/app-session routes and RLS,
  removes service-role writes from GETs, and retains atomic default switching.
- **Hive access convergence:** Plan 318 records and lease-claims each accepted
  member change before either store write, treats Supabase as the effective
  gate, and retries the dedicated Hive mirror to an observable final state.
- **Package-release architecture:** Plan 319 replaces 14 copied privileged
  release state machines and their second metadata registry with one reusable
  workflow, one checked config, and an operator-approved non-publishing canary.
- **Microsoft Calendar deletion safety:** Plan 315 exhausts bounded Graph
  continuation pages and forbids absence-based deletion from any partial,
  cyclic, capped, invalid, or failed enumeration.
- **Nova privilege coverage:** Plan 316 characterizes challenge-manager grants
  and revocations across global, role, assigned, wrong-challenge, and failure
  paths without changing the authorization contract.
- **External-AI authority:** Plan 317 retires Web's duplicate external-app auth,
  provider, metering, settlement, and retry stack only after supported callers
  move to the canonical AI host and an approved zero-traffic window completes.
- **Calendar sync authorization:** Plan 115 now closes the body-controlled cron
  label that let an authenticated manual caller bypass the cooldown without the
  verified cron credential.
- **Calendar outbound recovery:** Plan 312 checkpoints deterministic remote
  creation before local settlement so database/process failure cannot duplicate
  an event on the next canonical sync.
- **Managed-project build provenance:** Plan 313 pins the generated Node base
  and exact package-manager selector so one recorded external commit identifies
  reproducible build inputs.
- **Speech boundary coverage:** Plan 314 characterizes both transports, audio
  shaping, reservation/settlement, abort/timeout, and public route errors with
  fake seams only.
- **Dockerfile frontend provenance:** Plan 310 now covers the nine mutable
  external `# syntax=` directives as well as every production-reachable base.

- **Calendar creation recovery:** Plan 308 gives provider-backed POST a durable
  actor-scoped idempotency identity, checkpoints the remote result, and replays
  it without retaining plaintext event content.
- **Task Progress import scaling:** Plan 309 validates 500-entry imports
  set-wise in one transactional RPC while preserving deterministic 404s,
  preview semantics, and the existing response.
- **Production build provenance:** Plan 310 derives every Dockerfile reachable
  from production Compose and pins each external base to a reviewed
  manifest-list digest.
- **Rust Worker toolchain:** Plan 311 pins the exact `worker-build` crate in
  verification and deploy and makes floating or mismatched selectors fail the
  canonical workflow check.
- **Calendar update/move recovery:** Plan 305 checkpoints every irreversible
  provider stage so retries cannot duplicate moved or cross-provider events.
- **Forms dashboard scaling:** Plan 306 pages form summaries and computes exact
  page counts set-wise instead of materializing the full catalog and history.
- **Production OCI provenance:** Plan 307 pins the privileged BuildKit daemon
  and production sidecars to reviewed manifest-list digests and rejects mutable
  references in canonical script tests.
- **Deferred text-generation characterization:** the shared text executor has
  almost no settlement/streaming coverage, but a standalone test plan could
  freeze its current success-to-failed fallback. Extend Plan 167's durable
  provider-success invariant first, then characterize the settled contract
  across non-streaming, streaming, abort, capture, and failure paths.

- **Role-definition tenant integrity:** Plan 300 makes role metadata and
  supplied permissions one transaction and replaces independent foreign keys
  with a composite role/workspace invariant.
- **Calendar deletion recovery:** Plan 301 gives provider-backed event deletion
  a durable replay identity so provider success plus local failure can converge.
- **Forms export completeness:** Plan 302 streams a stable complete CSV and
  rejects oversized XLSX before emitting a plausible partial workbook.
- **Public agent authentication:** Plan 303 accepts both documented public
  credential types once, passes that identity into metering, and separates
  database failure from genuine absence.
- **UI package integrity:** Plan 304 declares the executable Types edge and
  proves the finance invoice export through the exact installed tarball.

- **Inventory product tenant integrity:** Plan 295 replaces a service-role
  request spread with a strict supported-field contract so catalog editors
  cannot rewrite product identity or tenant ownership.
- **Support-inquiry authorization:** Plan 296 aligns direct page, TypeScript
  GET/PATCH, and Rust PATCH access with the established root-workspace
  membership contract instead of treating an email domain as authority.
- **Stock-ledger integrity:** Plan 297 commits inventory quantities and their
  exact movement history in one tenant-validating, serialized transaction.
- **Workflow supply-chain integrity:** Plan 298 pins every remote action and
  reusable workflow to a reviewed immutable commit and makes mutable refs fail
  canonical script tests.
- **Image-generation coverage:** Plan 299 puts malformed request handling inside
  the public error boundary and characterizes reservation, concurrent provider,
  settlement, capture, abort, and partial-failure behavior.

- **Deferred Teach roster scaling:** the course-members endpoint returns an
  unbounded joined roster that feeds membership, attendance, reports, and
  metrics. Promote a stable cursor/search/selected-ID hydration plan only after
  the four consumers freeze whether they need full-roster batch operations or
  independently paged views (high confidence, L, MEDIUM).

- **Package-release credential scope:** Plan 292 removes production Supabase
  and proxy credentials from five package build jobs before dependency install
  and adds a fleet invariant against their return.
- **Embedding availability boundary:** Plan 293 caps streamed request bytes and
  aggregate input before token estimation, metering, provider dispatch, or
  content capture while preserving the public success contract.
- **Invoice deletion integrity:** Plan 294 deletes only the workspace-qualified
  invoice parent so validated FK actions settle the financial graph atomically
  instead of application child-first partial commits.

- **Deferred Finance directory scaling:** Finance user/creator filters still
  materialize and silently cap complete directories. Promote a bounded
  server-search plan after the Finance owner freezes ordering, literal-search,
  selected-ID hydration, and response compatibility for all three modes.

- **Finance budget tenant integrity:** Plan 289 binds wallet/category references
  and every spent recomputation to one workspace, then repairs valid historical
  totals without silently disposing mismatched links.
- **AI Studio observability:** Plan 290 returns exact step/tool counts from the
  bounded run page instead of a truncatable raw PostgREST read and false-zero
  fallback.
- **AI package dependency hygiene:** Plan 291 removes 35 proven phantom runtime
  declarations, guards config-driven exceptions, and verifies the installed
  public tarball.

- **Finance import integrity:** Plan 285 makes bounded Money Lover wallet,
  category, transaction, source mapping, and operation settlement one atomic
  exact-replay-safe transition.
- **Contacts dashboard performance:** Plan 286 replaces six count queries and
  six repeated satellite permission resolutions with one authorized aggregate.
- **Mobile credential correctness:** Plan 287 commits CI-token issue/revoke and
  audit together and covers every token validation and HTTP boundary.
- **Database tooling coverage:** Plan 288 finishes Plan 004's directory
  discovery contract so all seven database script suites enter `bun check`.

- **Square finance correctness:** Plan 280 refuses to acknowledge refunds or
  disputes until every required sale, refund, hold, and release entry is
  durably linked or pending under its immutable source key.
- **Supplier alias parity:** Plan 281 makes authorization and service-role data
  access consume the same canonical workspace UUID across all compatibility
  methods and the prepared Rust GET.
- **Time-tracking authority:** Plan 282 closes Web's five stale security/
  integrity behaviors, moves all 25 overlapping routes first-class, and leaves
  one shared product implementation behind explicit Web/Track auth adapters.
- **Changelog boundedness:** Plan 283 caps and validates collection pages,
  separates list summaries from rich details, implements literal search in
  TypeScript/Rust, and pages the public TanStack view.
- **GitHub credential coverage:** Plan 284 characterizes watcher validation,
  installation-token minting, local settlement, HTTP sanitization, and every
  post-mint failure without real credentials.

- **Inventory compatibility integrity:** Plan 275 closes the last unrestricted
  supplier item update so callers cannot rewrite tenant ownership or immutable
  metadata through the service-role compatibility route.
- **Workspace settings authorization:** Plan 276 replaces membership-only
  arbitrary upserts with a strict guest-lead-only schema and its maintained
  `create_lead_generations` capability, while keeping satellite sessions
  working and rejecting time/break/referral fields.
- **Internal-account scalability:** Plan 277 moves exact-domain filtering,
  search, sort, count, and pagination to PostgreSQL and removes the Auth
  directory ceiling plus per-account storage RPC fan-out.
- **Cleanup reproducibility:** Plan 278 makes routine cleanup preserve the
  tracked dependency graph and puts lockfile deletion behind an explicit,
  non-resolving exceptional command.
- **Rust cache safety:** Plan 279 protects recently active target entries from
  automatic size-pressure deletion and reports unresolved excess truthfully.

- **Global email controls:** Plan 270 separates email-blacklist reads from
  mutation authority across TypeScript, Rust, and direct database access.
- **Zalo listener resilience:** Plan 271 contains full callback failures so one
  malformed/provider event cannot escape as an unhandled rejection or poison
  later delivery.
- **Mail AI-label performance:** Plan 272 replaces up to 10,000 rich message
  hydrations and tens of thousands of related reads with one bounded compact
  latest-message context query.
- **TOTP boundary coverage:** Plan 273 characterizes every live factors,
  challenge, verification, deletion, throttling, and assurance-level method.
- **Satellite E2E ownership:** Plan 274 moves eleven permanently skipped Web
  cases plus the omitted Posts UI assertion to their four live app origins and
  enrolls those suites in canonical CI.

- **Notes log privacy:** Plan 265 removes complete workspace-note bodies from
  server logs and proves valid and rejected rich text stays private.
- **Inbound Mail integrity:** Plan 266 commits message, recipients, attachment
  metadata, label, counters, and auto-draft state as one replay-safe graph.
- **Recurring-session scalability:** Plan 267 resolves shared relations once and
  applies them transactionally to every materialized occurrence.
- **Mobile setup reproducibility:** Plan 268 separates deterministic setup from
  intentional Flutter dependency upgrades.
- **Native TypeScript installs:** Plan 269 keeps Bun's one-day exception exactly
  aligned with the locked native-preview platform family.

- **Task Progress administration:** Plan 261 preserves member reads and self
  join/leave while restricting administrative mutation and atomically creating
  the leaderboard with its creator membership.
- **Mail ingress bounds:** Plan 262 authenticates before body parsing and rejects
  gross multipart/file sizes before allocating attachment bytes.
- **Task bulk-action latency:** Plan 263 runs independent per-task mutations
  through one four-wide Effect boundary while preserving granular rollback and
  broadcasts.
- **Utils package boundary:** Plan 264 makes Next/React host peers, removes the
  unused React DOM edge, and proves the exact prepared tarball in isolation.

- **Inventory input integrity:** Plan 258 replaces three privileged
  request-to-insert spreads with strict name-only setup contracts while
  preserving supported compatibility URLs.
- **My Tasks scalability:** Plan 259 pages completed history before relation
  materialization and stops every apparent page from reloading lifetime task
  history.
- **Browser data migration:** Plan 260 classifies and removes deprecated broad
  browser Supabase value imports, corrects public guidance, and makes the
  compatibility client explicitly opt-in.

- **SePay rotation availability:** Plan 255 turns endpoint rotation into a
  durable provider-aware transition so the callback never remains pointed at
  a disabled local token.
- **Emergency-access correctness:** Plan 256 validates, serializes, and commits
  override revocation plus replacement in one transaction, preserving the
  working exception on every rejected attempt.
- **Recovery-email settlement:** Plan 257 gives every pre-provider failure and
  post-acceptance settlement outcome a closed HTTP/client contract, with
  complete focused coverage and no live external calls.

- **Billing reconciliation safety:** Plan 251 prevents Polar lookup failure
  from creating a duplicate free subscription and prevents a database lookup
  failure from revoking a valid active subscription.
- **Billing-summary latency:** Plan 252 removes a discarded Polar seat-list
  request from every no-store workspace summary while preserving full billing
  detail behavior.
- **Mobile policy authority:** Plan 253 replaces two live, byte-identical
  TypeScript mobile-version/OTP policy engines and their duplicate tests with
  one Auth-owned implementation plus thin host re-exports.
- **Migration deployment truth:** Plan 254 aligns the DevOps overview with the
  canonical fact that Web remains live and TanStack/Rust deployment is future
  validation capability until explicit cutover.

- **Meet plan-boundary integrity:** Plan 248 binds guest availability and
  creator-driven participant cleanup to one verified plan and commits all
  selected-plan cleanup in one transaction.
- **Inventory provider repair:** Plan 249 replaces unbounded serial HTTP/cron
  reconciliation with a leased, cursor-checkpointed, concurrency-bounded job
  and truthful manual progress contract.
- **Post-email queue authority:** Plan 250 moves the duplicated Web and
  Infrastructure queue state machines into one host-neutral users-core engine,
  retaining only tested transport adapters and first-class Web route ownership.

- **Lead-email delivery safety:** Plan 243 tenant-binds and validates the guest
  lead before dispatch, then uses a durable idempotent claim whose uncertain
  provider outcome is visible and never silently resent.
- **Subscription invoice tenant integrity:** Plan 244 proves every education,
  finance, and inventory parent belongs to the invoice workspace and commits
  coverage, lines, promotion, and stock exactly once.
- **Task-note scalability:** Plan 245 gives Tasks, Web, Rust, OpenAPI, the typed
  client, and the Notes UI one bounded stable cursor contract beyond the
  PostgREST row cap.
- **Published APIs dependency integrity:** Plan 246 declares the runtime Types
  edge exercised by the wallet-interest export and extends the exact installed-
  tarball smoke contract.
- **Migration ledger freshness:** Plan 247 makes stale TanStack route ownership
  or README progress fail both canonical `bun check` and Rust/TanStack CI.

- **Forms tenant isolation:** Plan 238 binds item saves and share-link reads or
  creation to a form already owned by the normalized route workspace before
  any service-role-backed operation.
- **Task sharing authorization:** Plan 239 separates board content edit from
  share/public-link administration, requiring a real member with
  `manage_projects` for every administrative method.
- **Nova criteria confidentiality:** Plan 240 reuses the completed catalog actor
  model so only global or assigned challenge managers can read private rubrics.
- **Form save integrity:** Plan 241 commits the complete form graph atomically
  with stable retained IDs, preventing failed saves and ordinary edits from
  detaching historical answers.
- **Invoice integrity:** Plan 242 commits the paid invoice, lines, promotion,
  stock movements, and sale audit in one tenant-validating transaction.

- **Calendar schedule tenant isolation:** Plan 233 validates every client
  preview source before writes and makes event-plus-junction creation atomic,
  with PostgreSQL enforcing task/habit event co-tenancy for every writer.
- **Referral settings correctness:** Plan 234 serializes the default-promotion
  settings change and exact legacy link-migration semantics in one rollback
  boundary instead of returning success after partial work.
- **Mobile deployment correctness:** Plan 235 commits version status, active
  pointer, and audit history as one stale-state-aware transition for activation
  and rollback.
- **Published artifact integrity:** Plan 236 clean-installs and imports every
  exact governed npm tarball after manifest rewriting and before OIDC publish.
- **Calendar cleanup truthfulness:** Plan 237 treats an explicit empty schedule
  as valid, deletes orphans atomically, and reports only confirmed deletions.

- **Inventory owner tenant isolation:** Plan 229 validates and
  database-enforces that every non-null linked workspace user belongs to the
  owner's normalized workspace.
- **AI-credit admin performance:** Plan 230 replaces raw membership
  materialization with one bounded grouped count and fails enrichment errors
  closed.
- **AI policy read correctness:** Plan 231 prevents privileged read failures
  from becoming editable empty defaults that can overwrite a real policy.
- **Legal package governance:** Plan 232 requires an explicit public/private
  decision and makes the package release contract match it mechanically.

- **Email-audit tenant isolation:** Plan 224 binds both service-role-backed
  Infrastructure email-audit loaders and their counts to the canonical
  authorized workspace.
- **Calendar log privacy:** Plan 225 removes reusable sync tokens and complete
  Google event payloads from server logs while retaining safe diagnostics.
- **External-chat delivery correctness:** Plan 226 introduces a durable
  at-most-once operation state machine and explicit ambiguous-delivery outcome
  for manual and automatic provider replies.
- **External-chat list performance:** Plan 227 keyset-pages threads and computes
  latest-message/count summaries set-wise for only the bounded page.
- **Published package integrity:** Plan 228 removes the public APIs package's
  static dependency on private payment code, injects billing at app hosts, and
  makes release readiness reject unsupported workspace edges.

- **Release supply-chain integrity:** Plan 220 revalidates the exact open
  Release Please PR head, generated-only authors/files, approval, and checks
  before an organization-admin token may merge and synchronize protected
  branches.
- **Forms media performance:** Plan 221 replaces one Storage request per cover,
  section, question, and option with deduplicated bounded batch signing while
  preserving per-item fallback.
- **Public package hygiene:** Plan 222 removes unused React runtime edges from
  the independently published APIs server-helper package after lock transfer.
- **Playground onboarding:** Plan 223 replaces its unusable Create Next App
  README with the actual Bun, Portless, source-path, and verification contract.

- **Fleet build correctness:** Plan 216 is DONE at final corrective commit
  `3a09b070ab`, integrated in verified main `cdef1c5533`; it removes the
  unsupported root-parameter import, uses the configured default during
  prerender, and keeps actual locale roots strict. Retained Plans 208/214/215
  are unblocked for replay.
- **Promotion tenant isolation:** Plan 217 proves both workspace user and
  promotion belong to the normalized Inventory route workspace before every
  service-role link read/write.
- **Capacity-rule durability:** Plan 218 commits rule fields and every supplied
  selector dimension in one tenant-bound transaction, so a failed PATCH cannot
  silently disable or weaken a hard rule.
- **Worktree safety:** Plan 219 makes mandatory setup lockfile-frozen by default
  and retains an explicit opt-in path for intentional lockfile reconciliation.

- **Cross-app identity security:** Plan 211 derives email from canonical user
  data, closes app/lifetime inputs, and prevents caller-authored provenance from
  mutating service admission or granting email-addressed shares.
- **API-key tenant integrity:** Plan 212 binds assigned roles to the key
  workspace in both privileged Web writes and PostgreSQL.
- **AI catalog correctness:** Plan 213 validates and transactionally applies one
  bounded model snapshot, and makes every incomplete fetch/write non-2xx.
- **Obsolete authority cleanup:** Plan 214 removes the unused unsafe browser
  multi-session store; Plan 215 removes Web's unreachable 10,628-line EPM
  implementation while preserving CMS redirects.

- **AI-credit confidentiality:** Plan 207 removes direct public/anonymous/
  authenticated execution from four ledger, entity, overview, and usage RPCs
  while preserving trusted admin callers.
- **Tasks cutover cleanup:** Plan 208 deletes 4,041 lines of zero-consumer Web
  habit-tracker and task-board forks after the completed Tasks cutover.
- **Member-directory completeness:** Plan 209 replaces silent 1,000-row Web/Rust
  truncation and enrichment fan-out with one stable, typed cursor page.
- **Push observability:** Plan 210 replaces both duplicated false-zero dashboard
  fan-outs with one trusted, bounded aggregate response.

- **Platform tenant confidentiality:** Plan 202 removes public execution from
  root-only workspace overview and subscription/error summary functions.
- **Report privacy:** Plan 203 makes group/user report-status summaries
  service-role-only while preserving users-core and Rust authorization.
- **Trust-cache completeness:** Plan 204 cursor-pages the reconciliation feed
  and makes partial Redis work observable instead of reporting false success.
- **Infrastructure project correctness:** Plan 205 fetches all bounded GitHub
  branch pages and reconciles the persisted snapshot set-wise.
- **Contacts cutover cleanup:** Plan 206 removes TanStack's orphaned 22,494-line
  users component fork after Plan 197; Plans 168/172 now target Contacts only.

- **Workspace-user merge security:** Plan 198 revokes untrusted direct access
  to two generic definer helpers while retaining fixed phased merge calls.
- **Tasks recovery integrity:** Plan 199 makes historical core/relationship
  reverts one locked transaction. Plan 200 makes board copying complete,
  set-wise, and replay-safe.
- **Infrastructure ownership:** Plan 201 deletes the newly orphaned Web mobile-
  deployment fork after Plans 173/174 establish the live boundary.
- **Suspension privacy:** Plan 195 removes anonymous/authenticated access to the
  cross-user definer RPC while retaining its service-role contract.
- **AI entitlement correctness:** Plan 196 commits FREE allocation changes and
  current-period balance propagation in one serialized transaction.
- **Contacts migration ownership:** Plan 197 replaces TanStack's eighteen
  independently rendered CRM routes with one tested Contacts redirect boundary.

- **Time-tracking mutation security:** Plan 190 removes public execution from
  missed-entry bypass and default-break definer helpers, aligns direct
  break-type writes with route permissions, rejects false zero-row success, and
  preserves invalid-target defaults.
- **Finance analytics security:** Plan 191 makes invoice projections
  service-only and bounds database-generated ranges. Plan 192 prevents callers
  from selecting a more privileged actor for transaction totals while keeping
  the prepared Rust trusted path explicit.
- **Time-tracking privacy:** Plan 193 replaces membership-only analytics RPCs
  with self/management/root boundaries and classifies every historical
  overload before removal or retention.
- **Contributor DX:** Plan 194 fixes three broken documentation entry links,
  replaces nonexistent index-page instructions, and adds an offline link
  contract.

- **Task maintenance security:** Plan 185 prevents authenticated clients from
  launching a global definer rewrite while preserving the established hourly
  cron owner and ordering semantics.
- **Observability integrity:** Plan 186 retires the unauthenticated
  development-only browser-to-admin writer, makes the remaining RPC
  service-only, fixes its search path, and bounds one call.
- **Finance migration privacy:** Plan 187 removes direct authenticated access
  to three cross-tenant projection helpers while preserving admin-backed
  Infrastructure dev routes and the API-key-bound v2 SDK migration route.
- **Contacts authorization:** Plan 188 aligns direct group and group-membership
  operations with granular users-core capabilities and enforces co-tenancy.
  Plan 189 also aligns custom-field table access, closes admin-backed mass
  assignment, and moves the changed Web handlers out of the legacy tree.

- **Task confidentiality:** Plan 180 binds the public accessible-task RPC to
  the authenticated actor and rejects foreign personal/team workspaces while
  preserving trusted server callers.
- **Session security:** Plan 181 removes null-auth fallthrough and anonymous
  execution from four definer RPCs that expose or revoke auth sessions.
- **Migration endpoint security:** Plan 182 removes a one-time global personal-
  workspace backfill that remains executable through the public Data API.
- **Contacts record security:** Plan 183 replaces existence-only ALL policies
  on feedback and attendance with co-tenant granular permission checks.
- **Finance mutation security:** Plan 184 prevents ordinary members from
  bypassing category create/update/delete permissions and reaching destructive
  transaction cascades.

- **Task authorization:** Plan 175 replaces an actor-ignoring task-list RLS
  helper that currently reduces membership to board existence. Plan 176 binds
  template background assignment, signing, and deletion to the template
  workspace/owner and removes direct authenticated write bypasses.
- **AI analytics confidentiality:** Plan 177 makes all six current execution
  analytics overloads service-role-only while preserving the root-admin page.
- **Inventory graph integrity:** Plan 178 commits listing, option, value,
  variant, and junction state in one set-based serialized transaction and emits
  provider work only after commit.
- **Finance architecture:** Plan 179 moves the only meaningful settings test to
  Finance and removes Web's unreachable 2,850-line post-cutover fork.

- **Database identity security:** Plan 170 removes unauthenticated tenant
  identity enumeration through two email-bearing Finance definer RPCs. Plan 171
  makes bulk workspace-user repair service-only and binds actor repair to self.
- **External delivery correctness:** Plan 172 atomically claims immediate and
  scheduled announcement attempts and makes post-dispatch uncertainty terminal
  instead of silently resendable.
- **Infrastructure architecture:** Plan 173 removes the 8,754-line unreachable
  post-cutover Web infrastructure graph and corrects Rust/docs provenance. Plan
  174 removes Infrastructure's byte-identical Storage Core fork and its newly
  orphaned analytics helper.

- **AI billing integrity:** Plan 167 makes pricing failure a durable pending
  state instead of terminally refunding successful provider work as zero-cost
  usage.
- **Bulk import correctness:** Plan 168 commits topic-announcement contacts,
  batches, drafts, and recipients together and makes ambiguous retries return
  the original graph.
- **Destructive storage safety:** Plan 169 deletes the authoritative whiteboard
  row before best-effort asset cleanup so a database failure cannot leave a
  reachable board with missing images.

- **Global financial-calendar security:** Plan 164 requires root
  `manage_workspace_roles` for holiday mutations in Infrastructure, Rust, and
  PostgreSQL while preserving read access and interest semantics.
- **Contacts history correctness:** Plan 165 cursor-pages large report
  snapshots and resolves the latest approved restoration base independently of
  PostgREST's 1,000-row cap.
- **Destructive merge recovery:** Plan 166 preserves failed and ambiguous bulk
  user-merge pairs for review instead of clearing them after partial success.

- **Workspace-user security:** Plan 158 retires the non-v1 Web handlers that
  expose full profile rows and mass mutations, then aligns direct database
  access with Contacts' granular permissions.
- **Destructive billing safety:** Plan 159 prevents tenant deletion whenever
  subscription lookup or Polar revocation is uncertain and preserves a
  recoverable provider association.
- **Habit correctness:** Plan 160 commits habit occurrence and linked Calendar
  completion state in one tested transaction.
- **Migration architecture:** Plan 161 keeps accepted route removals in a
  structured, verifiable ledger consumed by progress and cutover gates.
- **Docs:** Plan 162 corrects the platform overview's stale assertion that all
  satellites are UI-only and every API is Web-owned.
- **Database DX:** Plan 163 adds a contained type-generation phase to the
  disposable validator so migration plans never read the shared default stack.

- **Database gate:** Plan 154 restores the full disposable pgTAP baseline so
  focused P0 security work can be distinguished from five known unrelated
  failures instead of remaining permanently uncommittable.
- **Billing correctness:** Plan 155 replaces a generated pseudo-receipt based on
  mutable subscription/catalog data with the recorded facts of an authorized,
  provider-synchronized paid order.
- **Track performance/correctness:** Plan 156 bounds category copying, fails on
  target lookup errors, and serializes case-insensitive target deduplication
  across Track and live Web.
- **Database DX:** Plan 157 makes local `sb:up` apply-only and leaves generated
  types behind the explicit `sb:typegen` command.

- **Tenant and graph integrity:** Plan 149 binds Track request/session/task/
  category and break-type references to one workspace before approval can
  mutate them. Plan 150 requires edit access to both boards before changing a
  Task relationship and tightens direct authenticated writes.
- **Validation and documentation:** Plan 151 gives exact-base worktrees a
  disposable Supabase stack instead of sharing migration history and ports.
  Plan 152 replaces schema-invalid local authorization recipes with current,
  hardened, source-checked examples.
- **Dataset correctness/performance:** Plan 153 replaces Web/Rust collection
  truncation with one bounded cursor contract and routes the UI through the
  typed internal API.

- **Project and credit integrity:** Plan 145 aligns project-task linking with
  the established `manage_projects` boundary in both Tasks routes and RLS while
  preserving member reads. Plan 146 replaces the AI-credit admin endpoint's
  stale read/overwrite plus ignored ledger insert with one serialized,
  idempotent balance-and-ledger transaction.
- **Teach delivery:** Plan 147 prevents bulk learner reports from treating
  failed or PostgREST-truncated source queries as complete and replaces the
  synchronous all-recipient request with bounded, resumable delivery.
- **Release metadata:** Plan 148 resolves eleven stale `jsr.json` contracts that
  trail npm versions even though release validation deliberately supports npm
  only.
- **Security/correctness:** Plan 141 binds Tasks update comments and reactions
  through workspace, project, and update for both cookie and admin-backed app
  sessions. Plan 142 requires a deleted target in the route workspace before
  cleaning mentions and keeps plain/Yjs task descriptions coherent.
- **Security/analytics:** Plan 143 removes browser authority over checkout
  lifecycle metrics, tenant-binds telemetry relationships, and records
  conversions from durable checkout/provider transitions.
- **DX:** Plan 144 turns the cross-language 700-line source ceiling into a
  changed-file ratchet that permits grandfathered files to shrink but not grow.

- **Security:** Plan 137 moves three Teach module/quiz-link mutations behind
  canonical education authorization, strict bodies, and tenant containment.
  Plan 138 fixes a structured-membership truthiness bug that discloses foreign
  Task workspace IDs. Plan 139 binds every linked-product parent to one
  Inventory workspace in both routes and PostgreSQL.
- **Performance:** Plan 140 caps the interactive Finance transaction page
  before its SQL and enrichment fan-out.

- **Security:** Plan 132 closes the batch-invite service-role boundary so only
  MEMBER actors with `manage_workspace_members` can reach seat checks or writes.
- **Testing/performance:** Plan 133 enrolls the deployed Chat/Meet Bun
  transports in root tests and typechecks; Plan 134 then evicts inactive rooms,
  owns maintenance timers, and bounds Chat subscriber pressure.
- **Performance/architecture:** Plan 135 splits Inventory Polar sync health into
  constant-size aggregates and cursor pages. Plan 136 removes dormant Calendar
  settings state/panels and localizes the reachable satellite surface.

- **Security:** Plans 090 and 091 separate Nova catalog visibility from atomic
  challenge admission. Plan 092 rejects privileged workspace-secret fields at
  the admin-client boundary and moves the edited handlers first-class.
- **Performance/correctness:** Plans 093 and 094 remove Mail's 5,000-message
  list scan and 200-message detail/action caps. Plan 095 replaces Drive's
  provider-wide rescans and incorrect totals with native cursors. Plan 096
  keeps Contacts attention filtering inside the paginated database query.
- **DX/architecture:** Plan 097 enrolls live satellite shells in scoped
  bilingual key contracts. Plan 098 consolidates eleven copied log-drain
  runtimes behind a server-only, incrementally migrated boundary.
- **Performance/architecture:** Plan 102 bounds user-group schedule reads in
  both Web and Rust. Plan 101 centralizes race-safe workspace-key creation.
  Plan 103 will add executable Web/Rust cron-job deletion coverage without
  changing production behavior after its exact handoff releases ownership.
- **Security/correctness:** Plan 104 binds external visitor PII to canonical
  conversation participation. Plan 105 extends Calendar's `manage_calendar`
  boundary to categories. Plan 106 keeps reservations until ambiguous provider
  checkout creation is durably reconciled.
- **Performance/architecture:** Plan 107 adds the missing prefix-leading API-key
  lookup index. Plan 108 replaces 20,306 excess scheduling lines with one
  server-only core after multi-owner coordination.
- **Security/correctness:** Plan 109 serializes the external-project email cost
  ceiling before provider dispatch. Plan 110 makes one Mind-to-Hive simulation
  import commit all NPC bundles and its workflow together or not at all.
- **Performance/architecture:** Plan 111 uses the existing Forms rollup RPC and
  page count so a ten-row page no longer loads all matching answers. Plan 112
  removes the shadowed 2,572-line time-tracker copy and leaves one tested module
  tree for Tasks and Calendar.
- **Security/correctness:** Plan 113 binds Track comment mutations to the parent
  request's route workspace. Plan 114 redacts unclassified database/provider
  failures from public Forms responses. Plan 115 retires orphaned Calendar
  provider-write routes and permission-gates manual canonical sync.
- **Correctness/architecture:** Plan 116 commits manual grades and attempt totals
  in one transaction. Plan 117 removes 6,553 unreachable Web calendar-settings
  lines while preserving the Calendar-owned implementation.
- **Security/correctness:** Plan 118 makes suspension a required tri-state auth
  decision across lightweight and wrapped session paths. Plan 119 serializes
  and durably reconciles externally billed Pay seat updates.
- **Architecture:** Plan 120 single-sources byte-identical Calendar preference
  resolution. Plan 121 retires an unused published onboarding helper only after
  registry-consumer and release-contract evidence permits it.
- **DX:** Plan 122 adds a fixture-tested, read-only coordination lifecycle audit
  so missing/noncanonical statuses and unarchived `done` notes are reported
  deterministically without granting cross-owner mutation authority.
- **Docs/dependencies:** Plan 123 makes the public UI quickstart compile against
  real subpath exports and styles. Plan 124 then moves React, React DOM, Query,
  and Table to a packed-consumer-tested host peer boundary after lockfile
  ownership clears.
- **Performance/test coverage:** Plan 125 characterizes the storage-unzip
  extraction boundary with injected archive and upstream seams before any
  production refactor.
- **Security:** Plan 126 prevents a caught Git authorization redirect from
  mutating repository-wide validation state. Plan 127 constrains Nova OG avatar
  fetching to the intended public Supabase avatar object path.
- **Security:** Plan 128 binds recurring wallet/category references to the
  route workspace at both the Finance API and database boundaries.
- **Performance/architecture:** Plan 129 replaces full-row CMS home metric
  transfers with exact database aggregates. Plan 130 then adds bounded,
  server-searched cursor pages for products, listings, and publishable choices.
- **Docs:** Plan 131 corrects four post-cutover satellite API ownership guides
  so contributors stop adding product handlers to the wrong host.
- **Security:** Plan 198 removes authenticated direct access to generic
  definer merge helpers whose caller-selected relation/column identifiers can
  escape the fixed workspace-user merge graph.
- **Tasks correctness:** Plan 199 restores selected historical fields and
  relationships in one locked transaction. Plan 200 copies the complete board,
  list, and task graph atomically with a stable replay key and no PostgREST
  truncation.
- **Architecture:** Plan 201 deletes the orphaned Web mobile-deployment fork
  after Plans 173 and 174 establish the final Infrastructure/Storage Core
  boundary.
- **Security:** Plans 202-203 close direct Data API access to platform-wide
  workspace and report-status definer projections.
- **Performance/correctness:** Plan 204 pages and verifies every edge trust
  cache subject; Plan 205 fully reconciles GitHub branches without per-row
  transaction writes.
- **Architecture:** Plan 206 removes the now-unreachable TanStack Contacts
  component authority and prevents Plans 168/172 from extending it.
- **Security:** Plan 207 closes four unchecked AI-credit definer projections and
  their caller-selected balance/reservation side effects.
- **Architecture/performance:** Plan 208 removes the dead Web Tasks-domain
  authority. Plan 209 pages the enhanced member directory across Web, Rust,
  internal API, and Mobile. Plan 210 reduces each push-dashboard load to one
  bounded database operation and stops masking failures as zero.

## Audit summary

- **Security:** Task Progress metric administration currently treats ordinary
  membership as authority in both service-role routes and direct RLS, allowing
  any member to rewrite shared scoring semantics or defaults. Devbox documentation promises per-lease Docker isolation, but
  the runner executes approved jobs directly on the registered host and its
  top-level denylist still permits general process execution; any root-workspace
  member can enqueue those jobs. Nova allows an ordinary app-session caller to
  mutate global platform role flags; its service-role session/submission routes
  omit object-level authorization, expose hidden test material through a caller
  boolean, and let participants write grading results. Short links accept
  arbitrary URL schemes. The task embedding webhook fails open when its secret
  is absent, then reaches admin and metered-AI operations. Global IP block and
  unblock accepts root membership or an email-domain shortcut without the
  Infrastructure permission boundary. Teach's three legacy AI object handlers
  trust a caller-selected workspace after only cookie authentication and bypass
  AI-credit settlement. Multiple AI routes return stack traces to callers, and
  Discord accepts signed interactions without timestamp freshness or a durable
  interaction-id claim. SES signature
  verification can be disabled in any deployment and the authenticated path
  trusts notification-selected S3 objects. Dataset API-key service-role queries
  omit the workspace predicate; role assignment accepts arbitrary global IDs.
  Mobile also leaves authenticated content visible in the OS app switcher until
  it locks after resume. The external app exposes privileged storage SDK
  handlers behind only the generic proxy guard, but its intended production/demo
  contract must be settled before a high-risk access-boundary change. Global
  email-blacklist writes also treat root membership as mutation authority in
  TypeScript, Rust, and RLS; Plan 270 preserves reads while requiring an
  explicit permission. The legacy Inventory supplier item route and the root
  workspace-settings POST also pass unrestricted bodies through service-role
  clients; the former can move a supplier across tenants, while the latter lets
  membership alone rewrite workspace-wide behavior and immutable metadata.
  Web also retains five weaker time-tracking route copies after their Track
  counterparts were fixed, including cross-user reads and comment containment.
  Drive export capabilities also become permanent bearer links when their TTL
  setting is missing or invalid, and Mail membership mutations do not preserve
  a final owner or prevent admins from mutating owners. The exported workspace
  summary Server Action also accepts a caller-selected user UUID before
  service-role membership/share reads, exposing another actor's workspace and
  tier/access directory.
  Five public-package build jobs expose production Supabase and proxy
  credential types before dependency installation despite credential-free
  build and test precedents. Workspace-role permission rows also have
  independent role/workspace foreign keys, and the privileged item writer can
  attach a local permission row to another tenant's role.
- **Correctness:** Hive access approval and direct member administration write
  Supabase and the dedicated Hive database in opposite orders without a durable
  reconciliation record, so a transient second-store failure leaves effective
  access and the product/request mirror split. QR login consumes an approved challenge before session
  issuance succeeds, so a transient issuance error can make the approved login
  unrecoverable; concurrent mobile timer polls amplify the race. Mobile deep
  links also share a single asynchronously overwritten pending slot. CLI browser
  opening reports success before asynchronous process-launch failure, hiding
  the manual login URL. Shared Forms submission limits and multi-table
  persistence are check-then-act and non-transactional; contact merge accepts a
  client-selected destructive resume offset; finance transaction mutations can
  report success after tag failures or delete attachments before a failed row
  deletion. Most Pay APIs use cookie-only actor resolution despite the
  satellite's app-session contract. Polar activation and Square catalog webhook
  side effects can be acknowledged without durable retry. SePay endpoint
  rotation disables the callback token still configured at the provider, and
  auth-recovery replacement revokes the working emergency exception before its
  successor is known to be valid. External-app registry rotation likewise
  deletes credential fields before inserting replacements and performs a
  fallible read after committing the new one-time secret. Rewise authorizes the route workspace but
  submits the platform root workspace for chat and files, while title/summary
  work resolves another implicit workspace. Square refund/dispute handlers can
  acknowledge returned finance errors or a partial won-dispute pair, and the
  supplier compatibility routes authorize aliases but query raw route strings.
  Finance invoice deletion separately removes line items and promotions before
  the parent, so a later failure can preserve an invoice after erasing its
  financial facts. Calendar event deletion removes the provider object before
  fallible link, habit-skip, and local-row settlement, making retries unable to
  reliably converge after a database failure. Calendar PUT has the analogous
  provider-first defect for updates and moves; Google move/update fallback and
  cross-provider create/delete can duplicate remote events after partial
  success. Calendar POST also creates the provider object before local
  persistence and carries no replay identity, so response or database failure
  can leave an orphan and a retry can create another. The documented public agent
  endpoint authenticates with an API-key-only helper and then authenticates
  successful key calls a second time, so registered external-app calls fail and
  credential state can be resolved inconsistently within one request. The
  canonical Calendar sync job repeats the create-before-local-write defect for
  every `failed` outbound event, and its manual caller can currently claim a
  cron source in JSON to bypass the cooldown. Microsoft inbound sync also
  treats the first 500-event Graph page as complete and can delete valid local
  mirrors whose provider events occur on a later page.
- **Tests:** `bun check` reaches `test:scripts`, but 15 test files under
  `scripts/` are absent from its hand-maintained command. A direct run proved 79
  of 80 cases pass and exposed a stale Hive Docker heap-budget assertion that
  the canonical gate never runs. GitHub watcher-to-installation-token issuance
  likewise has no service or route coverage despite minting a repository
  credential. Eight deployed Next workspaces with at least
  213 unit files declare no Turbo `test` task; direct runs exposed stale Tasks
  tests and Inventory collection/root errors. The full SePay webhook state
  machine and recurring-transaction route handlers have no integrated route
  tests. Recovery-email credential/provider/audit issuance is likewise covered
  only by URL-builder tests. The live TOTP HTTP boundary has no handler suite,
  and eleven hard-cutover browser contracts remain permanently skipped in Web
  instead of running at Inventory, Finance, Teach, or Contacts origins. Public
  speech execution has only two transport happy paths despite owning schema,
  metering, timeout/abort, audio decoding, and terminal settlement behavior.
  Nova's challenge-manager grant/revoke route likewise has no focused actor,
  target-eligibility, duplicate, or database-failure coverage.
- **Performance:** the deadline-reminder cron reads the complete due set and
  performs sequential per-task/per-interval/per-watcher RPCs; its separate
  check, create, and record operations can duplicate notifications under
  overlap. Hive retains every room ID forever and scans them every ten seconds;
  its realtime message/world payloads also have no measured bounds. Storage
  analytics recursively walks the full object tree with serial page requests.
  Meeting transcription buffers unbounded, untyped audio before
  metered AI invocation. The public AI generate endpoint also accepts unbounded
  prompt/system input before provider invocation and full execution persistence.
  Notification batch cron materializes the whole backlog
  and does not verify its conditional claim, enabling duplicate delivery. Mail
  AI-label classification can hydrate 200 rich messages for each of 50 threads,
  including per-message state, labels, recipients, attachments, and headers,
  before using only ten compact excerpts per thread.
  Wallet checkpoint reads can issue roughly wallets-times-checkpoints RPCs, and
  periodic reports expand schedules/groups/members serially. Money Lover import
  and sales export remain unbounded; Inventory sales-period counts are N+1.
  My Tasks also relation-hydrates complete active and completed histories for
  every apparent 20-row completed page, repeating the same unbounded RPC.
  Infrastructure internal-account pages similarly walk up to 10,000 Auth users
  before slicing and then issue up to two storage RPCs per returned account.
  Changelog collection reads accept caller-sized pages of complete rich-text
  documents, and the public TanStack page explicitly asks for 1,000 at once.
  The public embeddings endpoint permits roughly two billion aggregate input
  characters by schema and parses them before its metering/error boundary.
  Forms CSV/XLSX export also hard-caps a complete-looking download at 5,000
  responses and materializes its response/workbook graph in one request. The
  Forms dashboard separately loads the complete form catalog plus raw sessions
  and responses, repeatedly scans them per form, and can silently under-count
  once PostgREST caps the raw history. Task Progress import validates up to 500
  rows through as many as eight sequential reads per row, so preview and commit
  can each spend roughly 4,000 database round trips before one batch insert.
  Mail bootstrap likewise performs at least two database operations per
  mailbox and can materialize 5,000 user-state rows for each merely to render
  unread badges. Its member settings route additionally materializes every
  membership and launches two profile reads per row with no bound or stable
  page contract.
- **Architecture/migration:** Fourteen governed npm publication workflows copy
  one privileged release state machine across 5,273 YAML lines while a separate
  test registry repeats their package/build metadata, multiplying every fleet
  security change. Two registered Rust v1 workspace handlers use
  unconditional-false API-key verifier stubs even though the crate contains a
  working scrypt implementation; the plan is blocked by active backend
  ownership and does not change live Next.js routing. The backend's 700-line
  source ceiling is not mechanically enforced and 110 Rust files already
  exceed it. Vendored Flutter PCM code lacks clear upstream provenance and its
  license file contains unresolved conflict markers. Rust declares version 1.95
  while local selection is unspecified and CI floats on `stable`. The deploy
  watcher implementation and test have grown to 8,759 and 11,714 lines,
  respectively. Web and Track also execute 25 copied time-tracking handlers;
  five have already diverged after Track-only fixes. Method-level Rust
  ownership remains weaker than the desired executable migration model. Ten
  app-local API-auth engines total roughly 9,700 lines and have already drifted
  in satellite audience policy. Learn/Teach contributor docs still describe the
  pre-cutover Web-owned API architecture despite 70 local v1 handlers. The Web
  dashboard also advertises Pipelines and Queues as separate products even
  though both route families are copies of Crawlers and create crawler records.
  Mind
  carries a 911-line Postgres log-drain fork whose only live context setter is a
  no-op, and Rewise retains a broad stale dependency/date-helper layer. The
  deprecated broad browser Supabase client remains enabled by default and
  publicly documented despite existing auth/realtime splits and typed API
  guidance. Rust verification and deploy also install a floating
  `worker-build` crate, so the compiler may be pinned while the Worker bundler
  still changes without a repository diff. Web also retains a second
  external-app chat/speech execution authority—with its own authentication,
  provider, metering, settlement, and retry code—even though the documented AI
  host owns the canonical endpoints and broader credential boundary.
- **Release observability:** Apps and Tools are deployed Vercel targets but lack
  the fleet's canonical `/api/build-info` exact-SHA endpoint; no registry-derived
  validation prevents future omissions.
- **Docs:** the root mobile README remains Flutter's starter template and does
  not describe this app's setup, generated code, authentication, or validation
  workflow.
- **Release engineering:** the public offline/realtime packages are versioned
  but have no visible publication workflow or support contract. The prior
  21-workspace lockfile mismatch plan is blocked by active overlapping
  release-lifecycle work and must be re-audited, not executed from stale
  assumptions. Four unused Shortener dependencies also create false transitive
  affected-path edges and unrelated deploy selection. Routine `bun clean`
  deletes the tracked lockfile and recommends an unfrozen reinstall, while the
  Rust cache helper can delete minute-old or actively changing target entries
  under size pressure. Public UI finance exports execute Types code even though
  `@tuturuuu/types` is declared only for development, so strict installed
  consumers can fail while workspace hoisting masks the edge.
- **Supply chain:** the production stack and CI run a privileged BuildKit
  daemon plus stateful edge/data sidecars from mutable OCI tags, so one Git SHA
  does not identify the upstream bytes that build and serve it. Production
  application Dockerfiles independently use mutable tag-only bases, so even a
  digest-pinned builder and sidecar fleet cannot make rebuilt app images
  reproducible until their reachable `FROM` graph is pinned too. Nine of those
  Dockerfiles also fetch a mutable external frontend directive, while the
  managed external-project generator separately uses a mutable Node base and
  installs latest Bun before recording only the source commit as deployed.
- **CMS:** Overview and insights load complete invoice/catalog projections to
  return scalars, while Products and Storefront load and render full catalogs
  and can mask downstream failures as empty state. Calendar, CMS, Finance, and
  Mind ownership docs also still describe their pre-cutover Web API model.
- **Finance integrity:** recurring POST/PUT accepts wallet and category IDs
  without proving they belong to the route workspace; app-session queries use
  service-role credentials, so the database needs the same co-tenant invariant.
- **Education/Tasks/Inventory:** three Teach module relationship mutations omit
  the canonical education/tenant boundary; Task workspace resolution treats a
  denied structured membership result as truthy; Inventory linked-product
  writes do not require their four parents to share the route workspace. Task
  update comments/reactions and mention cleanup also trust unrelated route
  workspace membership before admin-backed mutations. Public Inventory
  analytics accepts forgeable checkout outcomes and cross-tenant references;
  three setup POST routes also spread caller JSON into privileged inserts.
- **Billing integrity:** the Pay workspace invoice route currently labels
  mutable subscription metadata and current catalog price as a paid credit-card
  receipt without resolving any payment record.
- **Database validation:** the new exact-base disposable runner exposes five
  known baseline suite failures, including stale Tulearn policy string checks;
  root `sb:up` also performs implicit generated-type writes despite the
  documented two-step workflow.
- **Workspace and identity integrity:** legacy non-v1 Web workspace-user routes
  expose complete profile rows and membership-only mass mutations, while the
  underlying table policy grants every member all operations. Workspace
  deletion also proceeds after subscription lookup or Polar revocation failure,
  removing the local reconciliation record while external billing may remain.
- **Habits and migration ownership:** habit completion acknowledges success
  after an unchecked Calendar-event update. Accepted-removal route overrides
  can disappear from generated migration accounting with only prose destination
  evidence, and the platform overview still describes every satellite as an
  API-less UI shell.
- **AI billing and bulk mutations:** AI Studio currently converts pricing RPC
  failure into a terminal zero-cost settlement that refunds already-consumed
  provider work. Topic-announcement import commits four service-role mutation
  stages without a transaction or replay key. Whiteboard deletion removes
  stored assets before proving the authoritative row can be deleted.
- **Definer-function security:** two Finance creator RPCs disclose private
  identity fields for arbitrary workspaces, while workspace-user bulk/self
  repair RPCs grant caller-independent identity mutations to authenticated
  clients. Two generic user-merge helpers additionally accept caller-selected
  relation and column names under definer privilege.
- **Delivery and cutover debt:** immediate topic-announcement sends bypass the
  queue claim and ignore final settlement failure. Infrastructure also retains
  a dead Web runtime fork and a byte-identical local Storage Core provider after
  hard cutover; removing that graph will expose a second orphaned 3,041-line Web
  mobile-deployment fork.
- **Tasks integrity:** historical reverts commit core fields and then perform
  unchecked relationship replacement, while board copying commits a multi-stage
  graph and can leave partial or silently truncated copies.

## Direction options

1. **Recommended: complete the Teach-to-Learn parent invitation loop.** The
   database models expiring invitations and Learn promises parent access, but
   there is no acceptance route or parent-link UI. Start with an identity,
   consent, expiry, revoke, and telemetry design spike before implementation.
2. **Turn Hive's research timeline into experiment comparison.** Hive already
   persists model, prompt mode, context, output, tokens, cost, trigger, and
   research-session identity, but comparison is manual JSON export. Define
   reproducibility and evaluator semantics first, then compare named sessions
   side by side on outcomes and cost.
3. **Activate one durable offline mobile workflow.** The mobile app initializes
   an offline queue, but no production dispatcher/enqueue path completes the
   promise. Start with Tasks quick capture: define identity and workspace
   binding, conflict semantics, retry/dead-letter visibility, and a reconnect
   success metric before expanding to other mutations.
4. **Complete CMS live-delivery proof with Yashie.** Use one real external site
   to validate draft/preview/publish, cache invalidation, rollback, and operator
   observability end to end. Treat this as a product contract exercise, not a
   broad CMS rewrite, and coordinate with the active CMS owners.
5. **Turn Mind node links into cross-app alignment.** Mind already stores link
   records, but users cannot attach live Tasks or Calendar objects and see their
   status/date drift on strategy nodes. Start with typed, permission-redacted
   forward links before adding reverse links.
6. **Graduate Rewise into workspace-scoped collective memory.** After Plan 026,
   source governed models and workspace knowledge collections through a
   provider-neutral boundary, then measure cited-answer success and knowledge
   reuse rather than raw chat volume.
7. **Turn Spark plans into governed Task projects.** Let users review and edit a
   generated plan before idempotently applying milestones/tasks, with explicit
   permission, rollback, and telemetry contracts.
8. **Make Track the full-history destination for embedded timers.** Keep compact
   timers in Tasks/Calendar and deep-link workspace/return context into Track's
   existing filtered history instead of duplicating it.
9. **Complete the modeled SMS notification channel.** Start with consent,
   verified destinations, quiet hours, regional compliance, idempotent delivery,
   and one high-value urgent event.
10. **Make Mira mute a trustworthy privacy boundary.** Stop audio frames at the
    recorder/transport boundary and prove none leave the client while muted,
    including reconnect and device changes.
11. **Add workspace-native Drive review requests.** Bind an immutable file
    version to an explicit review state and governed Task, preserving file and
    reviewer authorization.
12. **Deliver consent-safe public Calendar booking links.** Begin with privacy,
    timezone, abuse, atomic hold/book, and provider rollback contracts before a
    limited pilot.
13. **Turn Mail promises into reviewed Tasks.** Offer an explicit reviewed
    conversion with redacted source linkage, permission checks, idempotency, and
    retention-aware behavior before considering automatic extraction.
14. **Turn upcoming financial obligations into reviewed commitments.** Let an
    authorized user convert a recurring obligation into a redacted Task or
    Calendar commitment without automatic disclosure of sensitive amounts.
15. **Turn Git activity into verified Task progress.** Start with manual
    task-to-PR linking and read-only CI badges, then add opt-in idempotent status
    transitions only after webhook authorization is proven.
16. **Create consent-aware Forms-to-Contacts intake.** Pilot explicit per-form
    mappings, deterministic dedupe, spam controls, durable jobs, and a complete
    audit trail after active Forms ownership clears.
17. **Graduate public Task links beyond the internal workspace.** After Plan
    034, pilot default-off, view-only capability links with expiry/rotation,
    crawler-safe metadata, abuse controls, revocation, and audit telemetry.
18. **Make Teach generation source-selectable and provenance-aware.** After
    Plan 025, let instructors select bounded module sources and review citations
    and source versions for accepted generated artifacts.
19. **Turn reviewed Meet transcripts into governed follow-up Tasks.** Start with
    organizer-only, opt-in extraction of editable action-item proposals with
    transcript provenance, redaction, assignee permission checks, and idempotent
    reviewed creation; never auto-create work from raw transcript output.
20. **Make Task cycles executable instead of metadata-only.** After Plan 046,
    define cycle membership and completion semantics, then pilot idempotent task
    add/remove plus a cycle detail/progress view before automated carry-over or
    scheduling. Implementation remains blocked by the active Tasks dashboard
    owner until the exact paths transfer.
21. **Turn selected Tasks into a reviewed project in place.** Finish the
    shipped-but-disabled bulk “create new project” affordance with a permissioned,
    idempotent create-and-attach contract and an inline review dialog that keeps
    selection on failure. This is distinct from Spark-generated projects and
    executable cycles, and remains blocked by active Tasks ownership.
22. **Make the stated workspace outcomes measurable.** Define a design-only,
    privacy-minimized contract for collaborative active days, first aligned
    project, active cross-app set, and completed automation. Prefer
    server-derived authoritative events, capture no content, and coordinate the
    cohort/activation semantics with the connected-onboarding handoff before any
    instrumentation.

The product-direction options are hypotheses, not implementation commitments;
validate them with users and telemetry. Immediate security and CI gaps remain
ahead of all twenty-two.

## Considered and deferred

- Delete the byte-identical orphaned `color-helper.ts` files in Nova, Rewise,
  and Web after repeating import/symbol reachability checks. The 291 dead lines
  are high-confidence and LOW-risk, but deletion is lower leverage than the
  promoted security/correctness/performance boundaries and should coordinate
  with the retained Rewise lane rather than earn a standalone plan now.

- Make app-token invitation acceptance retry-safe before promoting it into an
  implementation plan. The action-token replay row is consumed before pending
  invite lookup and before Polar seat plus local membership settlement; a later
  failure makes retry return `already used`, while both accept paths rely on
  best-effort seat revocation after local failure. This is a high-confidence,
  P0/L/HIGH correctness issue, but the active member-invite handoff owns both
  exact routes and must first freeze whether one durable operation spans browser
  and app-token acceptance, how provider seat adoption/reconciliation works,
  and which local membership/link/role/invite facts commit atomically. Do not
  let a cold executor invent that external billing state machine.

- Make both workflow-policy enumerators accept `.yaml` and `.yml` by sharing
  the existing `/\.ya?ml$/` helper, with a violating `.yml` fixture. Seven live
  workflows are currently omitted by two checks, but the existing `.yml` files
  appear compliant; defer this S/LOW regression-guard fix until the native/non-
  Vercel CI handoffs transfer `scripts/ci/check-workflow-config.test.js` (high
  confidence).

- Rejected as a competing settlement plan: await and inspect Tasks AI credit
  deductions in catch-up, suggestions, and journal only through Plan 053's
  stable execution identity/idempotent settlement foundation. The unawaited
  calls and resolved `{ success: false }` results are real, but a separate
  database identity contract could double-charge or rerun provider work; extend
  Plan 053 or add a dependent route slice after that invariant lands (high
  confidence, M/L, HIGH).
- Cursor-page Task template marketplace/workspace catalogs and batch-sign only
  visible deduplicated backgrounds after Plan 176 settles provenance. Both
  pages currently fetch every full template content graph and issue one storage
  signing request per background, but the correct summary/detail and loading UI
  contract should be characterized with the Tasks owner first (high confidence,
  M, MED).

- Rejected as overlapping: a new standalone characterization plan for Pay
  subscription cancellation/reactivation. Plan 007 already requires
  representative customer-portal route coverage; extend that owned test matrix
  rather than creating a competing plan for the same auth boundary.

- Aggregate workspace API-key `last_used_at` set-wise and clamp settings-page
  pagination. The current page materializes globally capped usage-log rows for
  every visible key, so one noisy key or a query failure can render another as
  never used; this high-confidence M/LOW improvement is unowned but lower
  urgency than the promoted tenant and financial-integrity boundaries.
- Move `@tuturuuu/types` from Utils devDependencies to runtime dependencies and
  add `task-helper/relationships` to the packed-artifact smoke matrix. The
  public subpath imports executable `isTaskPriority`, but the manifest omits
  that runtime edge; defer this S/LOW-MED package fix until Mail transfers
  `bun.lock` and Plan 236 owns the shared smoke configuration.

- Page AI-credit transaction IDs before enrichment and resolve member counts
  plus workspace tiers once per distinct page workspace. The current RPC counts
  the full filtered history before `LIMIT` and repeats two correlated lookups
  per row, but response-total and Web/Rust cursor compatibility should be
  characterized after Plans 207/230 own the adjacent contracts (high
  confidence, M/L, MED).
- Replace the stale Create Next App READMEs in Web, Nova, and Rewise and extend
  the starter-template validator. All three name nonexistent Pages Router files,
  port 3000, and npm/yarn commands, but this small docs batch is lower leverage
  than the five promoted runtime/release boundaries (high confidence, S, LOW;
  no active exact-path owner).

- Aggregate and bound Task-progress leaderboards after product owners freeze
  manual/autonomous metric, tie-break, team, and date-boundary semantics. The
  collection currently performs up to four full-history reads per leaderboard,
  with 1,000/5,000-row caps producing plausible but incomplete rankings; this
  is high confidence and high impact, but the set-based replacement is L/MED
  and should not let an executor invent competitive-ranking behavior.
- Give the 28 Infrastructure export collections one validated bounded page
  contract only after backend/G22 and current consumers choose table-specific
  stable unique ordering. TypeScript and prepared Rust currently share
  unvalidated, unordered offset ranges, but a blanket order/cap could break
  legacy exports; defer the L/MED migration until the method-parity lane can
  characterize successive-page compatibility across representative tables.
- Bound and batch meeting-recording playback only after the product owner
  characterizes chunk semantics. The Web and Rust endpoints currently load all
  chunks and make one signing request per chunk, but both live Meet hooks consume
  only the first returned URL. Introducing a cursor before deciding whether the
  first row is a complete recording or one segment could preserve the existing
  waste while breaking playback/transcription continuity (high confidence on
  the N-request defect, M, MED compatibility risk; backend/G22 ownership).

- Remove credentials from Turbo's repository-global environment scopes. The
  current configuration exposes or hashes provider/OAuth/service secrets for
  unrelated tasks, but implementation is deferred until the advisor produces a
  complete checked-in credential-to-workspace/task map with explicit `env`
  versus `passThroughEnv` dispositions and the active `turbo.json` lane
  transfers ownership (high confidence, M, MED cache/runtime risk).
- Make the Task embedding cron claim a monotonic retry/dead-letter queue and
  return failed cron health when a bounded batch cannot progress. The current
  unordered first 100 can be permanently occupied by non-processable tasks and
  still report `ok: true`; defer the M/MED implementation until Tasks/database
  ownership settles and the metered-provider-success/database-settlement crash
  window has an explicit no-double-charge contract (high confidence).
- Make Polar product/order/subscription reconciliation bounded and failure-
  visible. All three Pay crons serially enumerate provider pages and rows and
  return 200 after page or row failure; a shared checkpoint/concurrency contract
  must first transfer from the active Pay handoff (high confidence, M, MED).
- Make Contacts group report bulk export complete beyond PostgREST's row cap in
  both users-core and Rust. The current single unpaged query silently returns a
  partial printable export; defer until the daily-report/backend owners choose
  a stable snapshot/cursor or asynchronous export contract (high confidence,
  M, MED).
- Rejected as already correct: the task-capacity relation trigger does not miss
  the final selector in `all` mode. Its `label_match_mode = 'all' OR ...` (and
  project equivalent) makes a selected inserted relation causative, while the
  post-insert contribution becomes nonzero only when the full set matches.
  Plan 218 addresses the separate confirmed multi-transaction PATCH defect.

- Page and bound Calendar smart-schedule and provider-sync cron workspace
  enumeration. Both routes materialize unpaged source rows and serially await
  one workspace request, so PostgREST's 1,000-row cap can omit workspaces and
  cron duration grows with aggregate downstream latency; defer this M/MED
  change until the completed-but-unarchived Calendar API ownership note is
  canonically disposed and lock/cooldown semantics are characterized (high
  confidence).
- Replace Infrastructure's reachable byte-identical copies of Inventory Core
  relation validation and workspace-currency helpers with the exported package
  contract. This S/LOW-MED split-authority cleanup needs the active Inventory
  revenue-bundles and Finance/Inventory owners plus `bun.lock` transfer (high
  confidence).
- Restrict `get_active_ip_block` and `get_ip_block_level` to their sole admin
  abuse-protection caller. They currently disclose arbitrary IP block status,
  reason, timestamps, and progressive level to authenticated clients, but this
  small privacy hardening is lower leverage than the promoted mutation and
  financial RPC boundaries and should coordinate with Plan 017 (high
  confidence, S, LOW).

- Cursor-page and server-shape the Contacts group-indicator matrix instead of
  loading duplicate full score/user datasets and repeatedly scanning them in
  an unvirtualized client table. The current path silently caps at PostgREST's
  1,000 rows and approaches quadratic work, but the correct aggregate/paging
  contract needs workload measurement and Contacts/database ownership first
  (high confidence, L, MED).
- Give SePay one implementation and one executable route owner. Web and
  Inventory currently retain byte-identical route/helper trees and libraries
  while the migration manifest, Inventory README, operator guide, and old
  cutover notes disagree about authority. Inventory/Finance and G22 owners must
  first disposition provider URLs, compatibility consumers, and the conflicting
  handoffs before a shared core or host retirement is safe (high confidence, L,
  HIGH OAuth/webhook/financial-write risk).

- Make active multi-account removal switch sessions before deleting the active
  vault row, preserve both rows on transient `setSession` failure, and return a
  non-2xx route result on failure. This high-confidence M/HIGH destructive-
  ordering fix is blocked by the nonarchived invite-auth ownership note and,
  because it substantially reworks a Web legacy route, requires first-class
  route migration plus G22 manifest coordination.
- Remove Calendar's unused `@tuturuuu/apis` edge and Meet's unused
  `@tuturuuu/ai`/`@tuturuuu/apis` edges with workspace package-manager commands.
  The declarations have no source/config consumers and inflate Turbo's upstream
  graph, but the small LOW-risk cleanup must wait for Mail's active `bun.lock`
  handoff.
- Delete Task project-update attachment rows before best-effort storage cleanup.
  The current handler removes the object first, so a later row-delete failure
  leaves a reachable attachment record pointing at missing data; defer this
  small/high-confidence correction until Plan 141's retained worktree releases
  the exact update-interaction subtree (S, MED destructive-ordering risk).

- Characterize task-detail permanent deletion and move calendar-event plus
  scheduling cleanup into one recoverable transaction; the live Tasks handler
  deletes scheduling state before the final task delete and ignores cleanup
  errors, but this M/HIGH mutation should follow Plan 154 and obtain the broad
  Tasks ownership lane (high confidence).
- Bound habit history windows and remove the shared TypeScript/Rust silent
  366-occurrence ceiling; also account for PostgREST's 1,000-row cap and keep
  response/status parity. This is high-confidence M/MED work but lower urgency
  than the promoted habit write inconsistency and needs coordinated Tasks,
  AI-scheduling, and backend ownership.
- Paginate Rewise chat summaries and message history with stable cursors rather
  than full-row reads that silently truncate at 1,000 messages. Defer until
  Plan 026's retained Rewise worktree lands or transfers its overlapping pages
  (high confidence, M, MED).

- Cursor-page project-update comment threads after Plan 141 is resolved. The
  current GET materializes the full oldest-first comment set and silently loses
  newer rows at PostgREST's 1,000-row cap, but its exact route is already dirty
  in the retained authorization worktree; design root-thread/descendant cursor
  semantics only after that boundary lands (high confidence, M, MED).
- Remove unused Day.js declarations from CMS, Drive, Mail, Meet, Nova,
  Playground, and `packages/apis` with workspace package-manager commands once
  CMS/Mail and `bun.lock` ownership transfers (high confidence, S, LOW).
- Make Shortener click analytics inspect Supabase insert errors instead of
  logging success after a returned failure; fold this small correctness/test
  repair into the next Shortener route slice because Plan 015 already owns the
  same public redirect/verification boundary (high confidence, S, LOW).
- Split Track's 4,965-line timer controller behind characterization tests and
  typed `packages/internal-api` session/template facades; the live component
  currently combines four timer modes, persistence, task creation, browser
  notifications, and raw API orchestration with no focused controller suite
  (high confidence, L, HIGH regression risk). Promote after the smaller timer
  correctness plans land or when a dedicated Track refactor lane is available.
- Resolve the AI model catalog set-wise instead of one
  `ai_studio_model_allowed` RPC per enabled model; preserve the complete policy
  matrix in pgTAP before replacing the N+1 path (high confidence, M, MED policy
  risk; blocked by the external-AI usage-policy handoff and generated types).

- Stop invalid workspace API keys before launching privileged work across the
  twelve TypeScript handlers that currently start an API-key check and an
  admin-backed query together. This is a high-confidence, M/LOW hardening item,
  but execution first needs an exact per-method TypeScript/Rust parity matrix
  and coordinated ownership across Finance, Inventory, G22 route artifacts,
  and existing backend handlers; do not patch only a subset and claim the
  boundary is fixed.

- Decide whether Hive's legacy seven-table backfill is complete; retire its live
  production route and E2E dependency if so, otherwise replace the unbounded
  all-history transaction with checkpointed keyset batches (high confidence,
  L, HIGH cross-database migration risk; deployment evidence required first).
- Aggregate Infrastructure realtime analytics in a bounded database response
  instead of fetching the actor/channel/time cube twice per filter change;
  blocked by migration/generated-type ownership and lower leverage than the
  promoted tenant-boundary fixes (high confidence, L, MED semantics risk).
- Reconcile the public `@tuturuuu/microsoft` and `@tuturuuu/vercel` package
  contracts: either govern publication/readiness/docs or make them private after
  registry-consumer checks (high confidence, M, MED external-contract risk;
  coordinate with active release/CI owners).
- Move folder renames to bounded, resumable storage jobs with provider-specific
  copy/verify/delete checkpoints; first settle the durable worker and conflicting
  write contract with the shared-storage owner (high confidence, L, HIGH
  destructive cross-provider risk).
- Restrict the dynamic workspace-config GET in both Web and Rust to the same
  config-specific permission matrix as the bounded collection route; promote
  only after every current dynamic caller is mapped to its required capability
  (high confidence on membership-only service-role reads, M, MED compatibility
  risk; blocked by G22/backend ownership).

- Move personal Zalo history sync behind a bounded, cursor-checkpointed durable
  job with batched persistence and progress state; blocked by the exact Zalo
  production handoff (high confidence, L, HIGH provider-integration risk).
- Bound costing CSV rows/categories and commit profiles transactionally or via a
  resumable import job; blocked by Finance/Inventory ownership (high confidence,
  L, HIGH financial-state risk).
- Replace the stock Next starter READMEs in Calendar, Drive, Finance, Meet,
  Shortener, and Tasks with executable app runbooks plus a stale-template check;
  coordinate with each active app owner (high confidence, M, LOW risk).
- Make Calendar category reorder transactional after Plan 105; keep this
  correctness change separate from the permission/RLS boundary (high confidence,
  M, MED ordering risk).

- Fix Discord's initial error responses so ingress returns a real initial
  interaction response instead of PATCHing `@original` before deferral (high
  confidence, S); keep separate from durable replay protection.
- Move Hive pair-queue execution out of the HTTP lifecycle into durable,
  bounded, idempotent work after selecting and registering an operational
  worker seam; one request currently permits 100 serial metered interactions
  (high confidence, L, HIGH credit/retry risk).
- Replace delete-first Task-draft conversion with durable idempotent conversion
  state so interruption cannot lose a draft or ambiguous creation duplicate a
  task; blocked on Tasks/database ownership and exact creation-boundary design
  (high confidence, L, HIGH risk).
- Atomically claim and reconcile Square OAuth callback state before token,
  settings, validation, and connection side effects; blocked by active
  Finance/Inventory ownership (high confidence, M/L, HIGH credential risk).
- Add destructive-executor tests for Mira and partial-failure tests for Discord
  assign/unassign operations (high confidence, M each; lower leverage than the
  uncovered ingress security boundary).
- Remove Mind's orphaned app-local Postgres log drain and now-unused driver
  after confirming no deployment relies on its runtime DDL or console patching
  (high confidence, S).
- Remove Rewise's proven-unused packages and dead Moment date helper with the
  workspace package manager, then add a focused dependency-usage check (high
  confidence, S; execute after Plan 026 to avoid manifest churn during the fix).
- Make `pyproject.toml` plus `uv.lock` Discord's sole dependency source, deleting
  or deterministically generating the drifting `requirements.txt` (high
  confidence, S).
- Correct Inventory documentation to describe its `/store/*` pages as legacy
  redirects and Storefront as the canonical buyer-facing owner (high confidence,
  S).
- Fix the legacy Calendar auto-schedule path that upserts newly generated event
  ids and then inserts the same scheduled set again; first decide whether to
  retire the Trigger helper in favor of the v1 unified route (high confidence,
  M migration risk).
- Make Meet teardown stop local/screen media tracks and make recording upload
  failures retain a recoverable blob while reconciling server recording state
  (high confidence, M; coordinate with Meet realtime ownership).

- Decide whether `apps/external` is a production satellite or a local SDK demo,
  then either require authenticated tenant/path authorization for all seven
  privileged storage handlers or production-disable them (HIGH security impact,
  M effort, HIGH rollout risk; product/deployment contract required first).
- Make QR login approval consumption and session issuance retry-safe, and
  serialize mobile polling so one approved challenge cannot be consumed without
  returning a usable session (high confidence, L, HIGH auth-boundary risk).
- Cover authenticated mobile UI before entering the OS task switcher, then keep
  the existing inactivity lock on resume; defer until the active mobile lock
  handoff releases its exact boundary files (high confidence, S).
- Serialize mobile deep-link routing or replace the single pending slot with an
  ordered, deduplicated queue so concurrent sources cannot overwrite or clear a
  newer link (high confidence, S).
- Align guest role controls in shared workspace-access UI after
  `tmp/agent-coordination/20260725-180000-member-invite-satellite-auth.md` reaches
  a canonical terminal state; the database/API boundary in Plan 002 remains
  authoritative meanwhile.
- Add integrated route-level tests for the full SePay webhook state machine,
  including token/endpoint resolution, rate limiting, dedupe conflict recovery,
  classification, finance write, tags, and finalization (high confidence, M).
- Bound Money Lover import bytes and rows before full `formData`/`JSON.parse`
  expansion (high confidence, M); separately stream/bound sales export.
- Persist idempotent Polar activation side effects and workspace-deduplicated
  Square catalog-sync jobs before webhook acknowledgement (high confidence,
  L/M, high/medium rollout risk).
- Migrate remaining cookie-only Infrastructure APIs to the existing
  satellite-aware actor helper after Plan 017 establishes the denylist pattern
  (high confidence, M; inventory routes and tests before broad editing).
- Increment inbound Mail thread counters atomically after deduplicated inserts
  so concurrent replies cannot lose unread/message counts (high confidence, M).
- Centralize Pay target-product eligibility so checkout, preview, and change
  reject archived or non-plan products consistently (high confidence on the
  allowlist gap, S effort).
- Bound calendar active-sync and Drive bulk-delete concurrency, with failure and
  cancellation tests (high confidence, M).
- Add measured byte/count/depth limits to Hive realtime CRDT updates and world
  payloads before persistence and broadcast (high confidence on missing bounds,
  M; thresholds require production-like measurement).
- Replace full-tree serial storage-analytics traversal with a bounded or
  provider-native aggregate strategy shared by TypeScript and Rust (high
  confidence, L, MED parity risk).
- Bound Calendar event query ranges/projections and schedulable-task candidate
  retrieval before decryption/filtering/fan-out; measure realistic result sizes
  before choosing caps (high confidence, M).
- Move full Polar catalog reconciliation out of the request path or introduce
  bounded concurrency with idempotent persistence (high confidence, M).
- Bound the legacy v1 crawler collection in both Web and Rust after owners
  choose a compatibility contract for its API-key `{data,count}` response and
  session array response. Both implementations currently select full HTML and
  Markdown bodies without a limit, but inventing one breaking cursor envelope
  before supported external callers are inventoried would be unsafe (high
  confidence on the performance defect, M, MED compatibility risk).
- Atomically claim a bounded notification-batch working set with
  `FOR UPDATE SKIP LOCKED`; require a successful claim before delivery and test
  overlapping workers (high confidence, M).
- Replace wallet-checkpoint per-row balance/interval RPCs with set-based
  functions and constant-query multi-wallet tests after active finance
  ownership clears (high confidence, L).
- Make periodic-report schedule expansion and member processing set-based or
  durably resumable; preserve AI-credit idempotency (high confidence, L, HIGH
  rollout risk).
- Aggregate Inventory sales-period counts in one workspace-scoped query rather
  than one commerce-sales RPC per period (high confidence, M).
- Split the 8,759-line deploy watcher behind characterization tests before any
  state-machine redesign (high maintenance value, L, HIGH regression risk).
- Add authenticated state-transition tests for Rust mobile MFA handlers; the
  current suite proves only OPTIONS/preflight behavior (high confidence, M).
- Bound and batch external-project manifest application after the Richfield
  owner chooses a transactional set-based contract or a durable checkpointed
  job; the current unbounded serial request path is high-confidence, but the
  correct recovery contract must not be executor-invented (high confidence, L,
  HIGH rollout risk).
- Establish upstream provenance, reproducible update instructions, and a clean
  license for the vendored Flutter PCM package before materially changing it
  (high confidence, M, MED legal/supply-chain risk).
- Add route tests for recurring-transaction handlers (high confidence, M).
- Add route-level Calendar mutation tests after Plan 010 makes the owning suite
  canonical (high confidence, M).
- Reconcile the missing `packages/internal-api/README.md` declared in package
  metadata and contradictory tRPC migration docs (useful, lower runtime impact).
- Save Teach quiz metadata, private answers, options, and optional module/set
  links in one tenant-validating transaction. The current service-role path can
  link a route-workspace quiz to a foreign module or quiz set and can retain
  partial option/answer state; defer the L/HIGH migration until the
  education/database lane can inventory every AI and CRUD writer (high
  confidence).
- Add focused characterization for Pay credit-pack checkout authorization,
  archived-pack rejection, Polar customer/checkout arguments, and provider
  failure mapping. The downstream webhook suite does not cover this money
  boundary, but the S/LOW test-only work must wait for exact transfer from the
  active Pay handoff (high confidence).
- Add a focused contract for Mail's internal credential-backed send route,
  covering private-key lookup, sender-domain and to/cc/bcc allowlists, IP and
  provider rate limiting, provider failure, and post-delivery audit failure.
  This M/LOW test-only boundary is high confidence but remains lower leverage
  than the promoted recovery and rotation correctness work and must wait for
  exact transfer from the active Mail handoff.
- Persist method-level Rust route ownership and add it to `bun check:backend`
  (high strategic value, L effort; next architecture plan).
- Require `manage_workspace_members` for invite-link detail GET (high
  confidence, S effort; suitable follow-up after the critical tenant fixes).
- Remove recipient addresses from mail-route logs (high confidence, S effort).
- Make dataset row, cell, and column mutations transactional (high confidence,
  M effort; coordinate with Plan 001's route extraction).
- Atomically reserve response-copy emails and quotas (high confidence, M
  effort).
- Move shared-form acceptance limits, response/answer writes, and session
  finalization into one transactional boundary with concurrency tests (high
  confidence, L, HIGH rollout risk).
- Replace contact merge's caller-selected `startTableIndex` with a persisted,
  actor-bound merge job whose final deletion requires every phase (high
  confidence, L, HIGH rollout risk).
- Make finance transaction/tag replacement transactional and move attachment
  cleanup plus inventory audit into durable idempotent side effects (high
  confidence, M).
- Split oversized `packages/internal-api` modules while retaining stable export
  paths (maintenance value, M effort, lower immediate impact).
- Split the 1,444-line `packages/utils/src/workspace-helper.ts` behind stable
  thin re-exports and characterization tests after Plans 138/171 settle their
  overlapping member/invite contracts; its broad 858-consumer surface makes it
  lower leverage and higher regression risk than the promoted bounded plans
  (high confidence, L, HIGH refactor risk).
- Replace N+1 workspace permission and education module lookups with bulk
  queries (performance value, M effort; requires workload measurement first).
- Repair stale `CONTRIBUTING.md` setup commands and broken security-policy link
  (useful but lower leverage than runtime and gate failures).
- Replace `apps/mobile/README.md`'s Flutter starter text with app-specific setup,
  generated-code, auth, and verification guidance (high confidence, S).
- Extract the roughly 9,700 duplicated lines of API-auth orchestration into a
  shared server-only engine with app-specific adapters and contract matrices
  (high confidence, L effort, HIGH regression risk).
- Correct the retired `/qr` Apps gateway documentation to `/tools/qr`, then add
  a contract test for documented launch examples (high confidence, S effort).
- Decide whether the public `games` and `workflows` packages are supportable
  products; retire them after registry checks or complete exports, tests, docs,
  and publishing (high confidence, S/M effort).
- Resolve Foundapack's status: re-home one validated founder workflow in a
  maintained surface or mark it explicitly historical (product decision).
- Share Learn/Teach's divergent vocabulary projection through `education-core`
  after Plan 018 corrects ownership docs and characterization fixtures capture
  both current readers (high confidence, M).
- Replace the five hand-maintained satellite registries with a capability-aware
  typed manifest, migrating one low-risk projection at a time (high confidence
  on duplication, L effort, MED design uncertainty).
- Define whether the public offline/realtime packages are supported releases,
  then either add provenance-aware publication automation or make them private;
  re-audit after the active release-lifecycle note terminates (high confidence,
  S/M, MED release risk).
- Revisit an outcome-oriented Apps gateway, executable method-level migration
  ownership, and typed Chat work-context links after the higher-leverage product
  loops above; each needs a focused discovery/contract spike before build-out.
- Keep Mira/Crystal/Voice consolidation, OpenAPI-derived internal API, and
  product-complete migration slices as later strategy options; the fresh parent
  and Hive opportunities have stronger unfinished-product evidence this cycle.

## Not audited in depth

- Full browser UX and accessibility parity across satellites.
- Production telemetry, query plans, and real workload distributions.
- Every Supabase RLS policy or historical migration.
- Dependency vulnerability databases and third-party service configuration.
- Live deployment, canonical-host, or release health.
