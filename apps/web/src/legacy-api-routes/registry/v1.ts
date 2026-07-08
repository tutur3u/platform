import type { LegacyApiRouteLoaderMap } from '../types';

export const v1RouteLoaders = {
  'v1/admin/ai-credits/allocations/route.ts': () =>
    import('../v1/admin/ai-credits/allocations/route'),
  'v1/admin/ai-credits/balances/route.ts': () =>
    import('../v1/admin/ai-credits/balances/route'),
  'v1/admin/ai-credits/entity-detail/route.ts': () =>
    import('../v1/admin/ai-credits/entity-detail/route'),
  'v1/admin/ai-credits/features/route.ts': () =>
    import('../v1/admin/ai-credits/features/route'),
  'v1/admin/ai-credits/models/route.ts': () =>
    import('../v1/admin/ai-credits/models/route'),
  'v1/admin/ai-credits/overview/route.ts': () =>
    import('../v1/admin/ai-credits/overview/route'),
  'v1/admin/ai-credits/sync-models/route.ts': () =>
    import('../v1/admin/ai-credits/sync-models/route'),
  'v1/admin/ai-credits/transactions/route.ts': () =>
    import('../v1/admin/ai-credits/transactions/route'),
  'v1/admin/ai/memory/backfill-mira/route.ts': () =>
    import('../v1/admin/ai/memory/backfill-mira/route'),
  'v1/admin/external-project-audits/route.ts': () =>
    import('../v1/admin/external-project-audits/route'),
  'v1/admin/external-project-bindings/[workspaceId]/route.ts': () =>
    import('../v1/admin/external-project-bindings/[workspaceId]/route'),
  'v1/admin/external-project-bindings/route.ts': () =>
    import('../v1/admin/external-project-bindings/route'),
  'v1/admin/external-projects/[canonicalId]/route.ts': () =>
    import('../v1/admin/external-projects/[canonicalId]/route'),
  'v1/admin/external-projects/route.ts': () =>
    import('../v1/admin/external-projects/route'),
  'v1/ai/chats/[chatId]/route.ts': () =>
    import('../v1/ai/chats/[chatId]/route'),
  'v1/ai/chats/route.ts': () => import('../v1/ai/chats/route'),
  'v1/ai/whitelist/me/route.ts': () => import('../v1/ai/whitelist/me/route'),
  'v1/assistant/live/token/route.ts': () =>
    import('../v1/assistant/live/token/route'),
  'v1/assistant/live/turns/route.ts': () =>
    import('../v1/assistant/live/turns/route'),
  'v1/aurora/forecast/route.ts': () => import('../v1/aurora/forecast/route'),
  'v1/aurora/health/route.ts': () => import('../v1/aurora/health/route'),
  'v1/aurora/ml-metrics/route.ts': () =>
    import('../v1/aurora/ml-metrics/route'),
  'v1/aurora/statistical-metrics/route.ts': () =>
    import('../v1/aurora/statistical-metrics/route'),
  'v1/auth/accounts/[accountId]/route.ts': () =>
    import('../v1/auth/accounts/[accountId]/route'),
  'v1/auth/accounts/current/route.ts': () =>
    import('../v1/auth/accounts/current/route'),
  'v1/auth/accounts/logout-all/route.ts': () =>
    import('../v1/auth/accounts/logout-all/route'),
  'v1/auth/accounts/logout/route.ts': () =>
    import('../v1/auth/accounts/logout/route'),
  'v1/auth/accounts/route.ts': () => import('../v1/auth/accounts/route'),
  'v1/auth/accounts/switch/route.ts': () =>
    import('../v1/auth/accounts/switch/route'),
  'v1/auth/app-token/exchange/route.ts': () =>
    import('../v1/auth/app-token/exchange/route'),
  'v1/auth/app-token/invitation-decision/route.ts': () =>
    import('../v1/auth/app-token/invitation-decision/route'),
  'v1/auth/cross-app-return/route.ts': () =>
    import('../v1/auth/cross-app-return/route'),
  'v1/auth/cross-app-session/refresh/route.ts': () =>
    import('../v1/auth/cross-app-session/refresh/route'),
  'v1/auth/cross-app-token/verify/route.ts': () =>
    import('../v1/auth/cross-app-token/verify/route'),
  'v1/auth/mfa/mobile/approvals/route.ts': () =>
    import('../v1/auth/mfa/mobile/approvals/route'),
  'v1/auth/mfa/mobile/challenges/[challengeId]/approve/route.ts': () =>
    import('../v1/auth/mfa/mobile/challenges/[challengeId]/approve/route'),
  'v1/auth/mfa/mobile/challenges/[challengeId]/route.ts': () =>
    import('../v1/auth/mfa/mobile/challenges/[challengeId]/route'),
  'v1/auth/mfa/mobile/challenges/route.ts': () =>
    import('../v1/auth/mfa/mobile/challenges/route'),
  'v1/auth/mobile/password-login/route.ts': () =>
    import('../v1/auth/mobile/password-login/route'),
  'v1/auth/mobile/send-otp/route.ts': () =>
    import('../v1/auth/mobile/send-otp/route'),
  'v1/auth/mobile/verify-otp/route.ts': () =>
    import('../v1/auth/mobile/verify-otp/route'),
  'v1/auth/otp/send/route.ts': () => import('../v1/auth/otp/send/route'),
  'v1/auth/otp/settings/route.ts': () =>
    import('../v1/auth/otp/settings/route'),
  'v1/auth/otp/verify/route.ts': () => import('../v1/auth/otp/verify/route'),
  'v1/auth/password-login/route.ts': () =>
    import('../v1/auth/password-login/route'),
  'v1/auth/qr-login/challenges/[challengeId]/approve/route.ts': () =>
    import('../v1/auth/qr-login/challenges/[challengeId]/approve/route'),
  'v1/auth/qr-login/challenges/[challengeId]/route.ts': () =>
    import('../v1/auth/qr-login/challenges/[challengeId]/route'),
  'v1/auth/qr-login/challenges/route.ts': () =>
    import('../v1/auth/qr-login/challenges/route'),
  'v1/auth/recovery/consume/route.ts': () =>
    import('../v1/auth/recovery/consume/route'),
  'v1/calendar/auth/accounts/route.ts': () =>
    import('../v1/calendar/auth/accounts/route'),
  'v1/cms/workspaces/route.ts': () => import('../v1/cms/workspaces/route'),
  'v1/course/route.ts': () => import('../v1/course/route'),
  'v1/devboxes/agents/events/route.ts': () =>
    import('../v1/devboxes/agents/events/route'),
  'v1/devboxes/agents/heartbeat/route.ts': () =>
    import('../v1/devboxes/agents/heartbeat/route'),
  'v1/devboxes/agents/poll/route.ts': () =>
    import('../v1/devboxes/agents/poll/route'),
  'v1/devboxes/agents/register/route.ts': () =>
    import('../v1/devboxes/agents/register/route'),
  'v1/devboxes/agents/shutdown/route.ts': () =>
    import('../v1/devboxes/agents/shutdown/route'),
  'v1/devboxes/cache/prune/route.ts': () =>
    import('../v1/devboxes/cache/prune/route'),
  'v1/devboxes/cache/route.ts': () => import('../v1/devboxes/cache/route'),
  'v1/devboxes/env/route.ts': () => import('../v1/devboxes/env/route'),
  'v1/devboxes/leases/[leaseId]/release/route.ts': () =>
    import('../v1/devboxes/leases/[leaseId]/release/route'),
  'v1/devboxes/leases/route.ts': () => import('../v1/devboxes/leases/route'),
  'v1/devboxes/previews/route.ts': () =>
    import('../v1/devboxes/previews/route'),
  'v1/devboxes/runs/[runId]/logs/route.ts': () =>
    import('../v1/devboxes/runs/[runId]/logs/route'),
  'v1/devboxes/runs/[runId]/route.ts': () =>
    import('../v1/devboxes/runs/[runId]/route'),
  'v1/devboxes/runs/[runId]/stop/route.ts': () =>
    import('../v1/devboxes/runs/[runId]/stop/route'),
  'v1/devboxes/runs/route.ts': () => import('../v1/devboxes/runs/route'),
  'v1/documents/[documentId]/route.ts': () =>
    import('../v1/documents/[documentId]/route'),
  'v1/documents/route.ts': () => import('../v1/documents/route'),
  'v1/exchange-rates/route.ts': () => import('../v1/exchange-rates/route'),
  'v1/inquiries/[id]/media-urls/route.ts': () =>
    import('../v1/inquiries/[id]/media-urls/route'),
  'v1/inquiries/[id]/route.ts': () => import('../v1/inquiries/[id]/route'),
  'v1/inquiries/route.ts': () => import('../v1/inquiries/route'),
  'v1/integrations/discord/available-members/route.ts': () =>
    import('../v1/integrations/discord/available-members/route'),
  'v1/integrations/discord/members/route.ts': () =>
    import('../v1/integrations/discord/members/route'),
  'v1/integrations/discord/route.ts': () =>
    import('../v1/integrations/discord/route'),
  'v1/internal/holidays/[holidayId]/route.ts': () =>
    import('../v1/internal/holidays/[holidayId]/route'),
  'v1/internal/holidays/bulk/route.ts': () =>
    import('../v1/internal/holidays/bulk/route'),
  'v1/internal/holidays/route.ts': () =>
    import('../v1/internal/holidays/route'),
  'v1/inventory/orders/[publicToken]/route.ts': () =>
    import('../v1/inventory/orders/[publicToken]/route'),
  'v1/inventory/orders/route.ts': () => import('../v1/inventory/orders/route'),
  'v1/inventory/polar/webhook/[wsId]/route.ts': () =>
    import('../v1/inventory/polar/webhook/[wsId]/route'),
  'v1/inventory/square/oauth/callback/route.ts': () =>
    import('../v1/inventory/square/oauth/callback/route'),
  'v1/inventory/square/webhook/[wsId]/route.ts': () =>
    import('../v1/inventory/square/webhook/[wsId]/route'),
  'v1/inventory/square/webhook/route.ts': () =>
    import('../v1/inventory/square/webhook/route'),
  'v1/inventory/storefronts/[slug]/analytics/events/route.ts': () =>
    import('../v1/inventory/storefronts/[slug]/analytics/events/route'),
  'v1/inventory/storefronts/[slug]/checkouts/route.ts': () =>
    import('../v1/inventory/storefronts/[slug]/checkouts/route'),
  'v1/inventory/storefronts/[slug]/route.ts': () =>
    import('../v1/inventory/storefronts/[slug]/route'),
  'v1/link-shortener/[linkId]/analytics/route.ts': () =>
    import('../v1/link-shortener/[linkId]/analytics/route'),
  'v1/link-shortener/[linkId]/password/route.ts': () =>
    import('../v1/link-shortener/[linkId]/password/route'),
  'v1/link-shortener/shorten/route.ts': () =>
    import('../v1/link-shortener/shorten/route'),
  'v1/live/session/route.ts': () => import('../v1/live/session/route'),
  'v1/live/token/route.ts': () => import('../v1/live/token/route'),
  'v1/live/tools/execute/route.ts': () =>
    import('../v1/live/tools/execute/route'),
  'v1/mira/achievements/route.ts': () =>
    import('../v1/mira/achievements/route'),
  'v1/mira/achievements/unlock/route.ts': () =>
    import('../v1/mira/achievements/unlock/route'),
  'v1/mira/focus/[id]/route.ts': () => import('../v1/mira/focus/[id]/route'),
  'v1/mira/focus/complete/route.ts': () =>
    import('../v1/mira/focus/complete/route'),
  'v1/mira/focus/history/route.ts': () =>
    import('../v1/mira/focus/history/route'),
  'v1/mira/focus/route.ts': () => import('../v1/mira/focus/route'),
  'v1/mira/focus/start/route.ts': () => import('../v1/mira/focus/start/route'),
  'v1/mira/memories/route.ts': () => import('../v1/mira/memories/route'),
  'v1/mira/pet/feed/route.ts': () => import('../v1/mira/pet/feed/route'),
  'v1/mira/pet/route.ts': () => import('../v1/mira/pet/route'),
  'v1/mira/soul/route.ts': () => import('../v1/mira/soul/route'),
  'v1/mira/token/route.ts': () => import('../v1/mira/token/route'),
  'v1/mira/xp/route.ts': () => import('../v1/mira/xp/route'),
  'v1/mobile/version-check/route.ts': () =>
    import('../v1/mobile/version-check/route'),
  'v1/notifications/[id]/metadata/route.ts': () =>
    import('../v1/notifications/[id]/metadata/route'),
  'v1/notifications/[id]/route.ts': () =>
    import('../v1/notifications/[id]/route'),
  'v1/notifications/account-preferences/route.ts': () =>
    import('../v1/notifications/account-preferences/route'),
  'v1/notifications/preferences/route.ts': () =>
    import('../v1/notifications/preferences/route'),
  'v1/notifications/push-devices/route.ts': () =>
    import('../v1/notifications/push-devices/route'),
  'v1/notifications/route.ts': () => import('../v1/notifications/route'),
  'v1/notifications/unread-count/route.ts': () =>
    import('../v1/notifications/unread-count/route'),
  'v1/nova/me/team/route.ts': () => import('../v1/nova/me/team/route'),
  'v1/platform/users/[userId]/roles/route.ts': () =>
    import('../v1/platform/users/[userId]/roles/route'),
  'v1/proxy/tuturuuu/route.ts': () => import('../v1/proxy/tuturuuu/route'),
  'v1/public/user-profile-links/[code]/avatar/route.ts': () =>
    import('../v1/public/user-profile-links/[code]/avatar/route'),
  'v1/public/user-profile-links/[code]/submit/route.ts': () =>
    import('../v1/public/user-profile-links/[code]/submit/route'),
  'v1/rate-limit-appeals/route.ts': () =>
    import('../v1/rate-limit-appeals/route'),
  'v1/shared/forms/[shareCode]/response-copy/route.ts': () =>
    import('../v1/shared/forms/[shareCode]/response-copy/route'),
  'v1/shared/forms/[shareCode]/route.ts': () =>
    import('../v1/shared/forms/[shareCode]/route'),
  'v1/storage/analytics/route.ts': () =>
    import('../v1/storage/analytics/route'),
  'v1/storage/delete/route.ts': () => import('../v1/storage/delete/route'),
  'v1/storage/download/[...path]/route.ts': () =>
    import('../v1/storage/download/[...path]/route'),
  'v1/storage/folders/route.ts': () => import('../v1/storage/folders/route'),
  'v1/storage/list/route.ts': () => import('../v1/storage/list/route'),
  'v1/storage/share-batch/route.ts': () =>
    import('../v1/storage/share-batch/route'),
  'v1/storage/share/route.ts': () => import('../v1/storage/share/route'),
  'v1/storage/upload-url/route.ts': () =>
    import('../v1/storage/upload-url/route'),
  'v1/storage/upload/route.ts': () => import('../v1/storage/upload/route'),
  'v1/topic-announcement-verifications/[token]/route.ts': () =>
    import('../v1/topic-announcement-verifications/[token]/route'),
  'v1/tulearn/bootstrap/route.ts': () =>
    import('../v1/tulearn/bootstrap/route'),
  'v1/user/onboarding-progress/route.ts': () =>
    import('../v1/user/onboarding-progress/route'),
  'v1/user/profile/route.ts': () => import('../v1/user/profile/route'),
  'v1/users/me/avatar/route.ts': () => import('../v1/users/me/avatar/route'),
  'v1/users/me/avatar/upload-url/route.ts': () =>
    import('../v1/users/me/avatar/upload-url/route'),
  'v1/users/me/board-list-overrides/route.ts': () =>
    import('../v1/users/me/board-list-overrides/route'),
  'v1/users/me/configs/[configId]/route.ts': () =>
    import('../v1/users/me/configs/[configId]/route'),
  'v1/users/me/default-workspace/route.ts': () =>
    import('../v1/users/me/default-workspace/route'),
  'v1/users/me/delete/route.ts': () => import('../v1/users/me/delete/route'),
  'v1/users/me/email/route.ts': () => import('../v1/users/me/email/route'),
  'v1/users/me/full-name/route.ts': () =>
    import('../v1/users/me/full-name/route'),
  'v1/users/me/hive-access/route.ts': () =>
    import('../v1/users/me/hive-access/route'),
  'v1/users/me/identities/[identityId]/route.ts': () =>
    import('../v1/users/me/identities/[identityId]/route'),
  'v1/users/me/identities/link/[provider]/route.ts': () =>
    import('../v1/users/me/identities/link/[provider]/route'),
  'v1/users/me/identities/route.ts': () =>
    import('../v1/users/me/identities/route'),
  'v1/users/me/password/reauth/route.ts': () =>
    import('../v1/users/me/password/reauth/route'),
  'v1/users/me/password/route.ts': () =>
    import('../v1/users/me/password/route'),
  'v1/users/me/profile/route.ts': () => import('../v1/users/me/profile/route'),
  'v1/users/me/workspaces/[wsId]/configs/[configId]/route.ts': () =>
    import('../v1/users/me/workspaces/[wsId]/configs/[configId]/route'),
  'v1/users/sessions/[sessionId]/route.ts': () =>
    import('../v1/users/sessions/[sessionId]/route'),
  'v1/users/sessions/route.ts': () => import('../v1/users/sessions/route'),
  'v1/webhooks/ai-agents/[adapter]/[channelId]/route.ts': () =>
    import('../v1/webhooks/ai-agents/[adapter]/[channelId]/route'),
  'v1/webhooks/sepay/[token]/route.ts': () =>
    import('../v1/webhooks/sepay/[token]/route'),
  'v1/workspaces/[wsId]/ai/credits/route.ts': () =>
    import('../v1/workspaces/[wsId]/ai/credits/route'),
  'v1/workspaces/[wsId]/ai/memory/export/route.ts': () =>
    import('../v1/workspaces/[wsId]/ai/memory/export/route'),
  'v1/workspaces/[wsId]/ai/memory/items/[memoryId]/route.ts': () =>
    import('../v1/workspaces/[wsId]/ai/memory/items/[memoryId]/route'),
  'v1/workspaces/[wsId]/ai/memory/items/route.ts': () =>
    import('../v1/workspaces/[wsId]/ai/memory/items/route'),
  'v1/workspaces/[wsId]/ai/memory/settings/route.ts': () =>
    import('../v1/workspaces/[wsId]/ai/memory/settings/route'),
  'v1/workspaces/[wsId]/ai/model-favorites/route.ts': () =>
    import('../v1/workspaces/[wsId]/ai/model-favorites/route'),
  'v1/workspaces/[wsId]/ai/prompts/[promptId]/route.ts': () =>
    import('../v1/workspaces/[wsId]/ai/prompts/[promptId]/route'),
  'v1/workspaces/[wsId]/api-keys/[keyId]/rotate/route.ts': () =>
    import('../v1/workspaces/[wsId]/api-keys/[keyId]/rotate/route'),
  'v1/workspaces/[wsId]/api-keys/[keyId]/route.ts': () =>
    import('../v1/workspaces/[wsId]/api-keys/[keyId]/route'),
  'v1/workspaces/[wsId]/api-keys/[keyId]/usage-logs/route.ts': () =>
    import('../v1/workspaces/[wsId]/api-keys/[keyId]/usage-logs/route'),
  'v1/workspaces/[wsId]/api-keys/roles/route.ts': () =>
    import('../v1/workspaces/[wsId]/api-keys/roles/route'),
  'v1/workspaces/[wsId]/api-keys/route.ts': () =>
    import('../v1/workspaces/[wsId]/api-keys/route'),
  'v1/workspaces/[wsId]/avatar/route.ts': () =>
    import('../v1/workspaces/[wsId]/avatar/route'),
  'v1/workspaces/[wsId]/avatar/upload-url/route.ts': () =>
    import('../v1/workspaces/[wsId]/avatar/upload-url/route'),
  'v1/workspaces/[wsId]/billing/route.ts': () =>
    import('../v1/workspaces/[wsId]/billing/route'),
  'v1/workspaces/[wsId]/chat/channels/[channelId]/messages/route.ts': () =>
    import('../v1/workspaces/[wsId]/chat/channels/[channelId]/messages/route'),
  'v1/workspaces/[wsId]/chat/channels/[channelId]/participants/route.ts': () =>
    import(
      '../v1/workspaces/[wsId]/chat/channels/[channelId]/participants/route'
    ),
  'v1/workspaces/[wsId]/chat/channels/[channelId]/typing/route.ts': () =>
    import('../v1/workspaces/[wsId]/chat/channels/[channelId]/typing/route'),
  'v1/workspaces/[wsId]/chat/channels/route.ts': () =>
    import('../v1/workspaces/[wsId]/chat/channels/route'),
  'v1/workspaces/[wsId]/chat/conversations/[conversationId]/ai-observability/route.ts':
    () =>
      import(
        '../v1/workspaces/[wsId]/chat/conversations/[conversationId]/ai-observability/route'
      ),
  'v1/workspaces/[wsId]/chat/conversations/[conversationId]/ai-settings/route.ts':
    () =>
      import(
        '../v1/workspaces/[wsId]/chat/conversations/[conversationId]/ai-settings/route'
      ),
  'v1/workspaces/[wsId]/chat/conversations/[conversationId]/attachments/[attachmentId]/route.ts':
    () =>
      import(
        '../v1/workspaces/[wsId]/chat/conversations/[conversationId]/attachments/[attachmentId]/route'
      ),
  'v1/workspaces/[wsId]/chat/conversations/[conversationId]/attachments/upload-url/route.ts':
    () =>
      import(
        '../v1/workspaces/[wsId]/chat/conversations/[conversationId]/attachments/upload-url/route'
      ),
  'v1/workspaces/[wsId]/chat/conversations/[conversationId]/link-previews/route.ts':
    () =>
      import(
        '../v1/workspaces/[wsId]/chat/conversations/[conversationId]/link-previews/route'
      ),
  'v1/workspaces/[wsId]/chat/conversations/[conversationId]/messages/[messageId]/route.ts':
    () =>
      import(
        '../v1/workspaces/[wsId]/chat/conversations/[conversationId]/messages/[messageId]/route'
      ),
  'v1/workspaces/[wsId]/chat/conversations/[conversationId]/messages/route.ts':
    () =>
      import(
        '../v1/workspaces/[wsId]/chat/conversations/[conversationId]/messages/route'
      ),
  'v1/workspaces/[wsId]/chat/conversations/[conversationId]/reactions/route.ts':
    () =>
      import(
        '../v1/workspaces/[wsId]/chat/conversations/[conversationId]/reactions/route'
      ),
  'v1/workspaces/[wsId]/chat/conversations/[conversationId]/read/route.ts':
    () =>
      import(
        '../v1/workspaces/[wsId]/chat/conversations/[conversationId]/read/route'
      ),
  'v1/workspaces/[wsId]/chat/conversations/[conversationId]/route.ts': () =>
    import('../v1/workspaces/[wsId]/chat/conversations/[conversationId]/route'),
  'v1/workspaces/[wsId]/chat/conversations/[conversationId]/shared-content/route.ts':
    () =>
      import(
        '../v1/workspaces/[wsId]/chat/conversations/[conversationId]/shared-content/route'
      ),
  'v1/workspaces/[wsId]/chat/conversations/[conversationId]/title/route.ts':
    () =>
      import(
        '../v1/workspaces/[wsId]/chat/conversations/[conversationId]/title/route'
      ),
  'v1/workspaces/[wsId]/chat/conversations/route.ts': () =>
    import('../v1/workspaces/[wsId]/chat/conversations/route'),
  'v1/workspaces/[wsId]/chat/directory/route.ts': () =>
    import('../v1/workspaces/[wsId]/chat/directory/route'),
  'v1/workspaces/[wsId]/chat/friend-requests/[requestId]/route.ts': () =>
    import('../v1/workspaces/[wsId]/chat/friend-requests/[requestId]/route'),
  'v1/workspaces/[wsId]/chat/friend-requests/route.ts': () =>
    import('../v1/workspaces/[wsId]/chat/friend-requests/route'),
  'v1/workspaces/[wsId]/chat/realtime/route.ts': () =>
    import('../v1/workspaces/[wsId]/chat/realtime/route'),
  'v1/workspaces/[wsId]/chat/search/route.ts': () =>
    import('../v1/workspaces/[wsId]/chat/search/route'),
  'v1/workspaces/[wsId]/consolidate-users/route.ts': () =>
    import('../v1/workspaces/[wsId]/consolidate-users/route'),
  'v1/workspaces/[wsId]/course-modules/[moduleId]/quiz-sets/route.ts': () =>
    import('../v1/workspaces/[wsId]/course-modules/[moduleId]/quiz-sets/route'),
  'v1/workspaces/[wsId]/course-modules/[moduleId]/route.ts': () =>
    import('../v1/workspaces/[wsId]/course-modules/[moduleId]/route'),
  'v1/workspaces/[wsId]/course-modules/route.ts': () =>
    import('../v1/workspaces/[wsId]/course-modules/route'),
  'v1/workspaces/[wsId]/courses/[courseId]/module-order/route.ts': () =>
    import('../v1/workspaces/[wsId]/courses/[courseId]/module-order/route'),
  'v1/workspaces/[wsId]/courses/[courseId]/modules/route.ts': () =>
    import('../v1/workspaces/[wsId]/courses/[courseId]/modules/route'),
  'v1/workspaces/[wsId]/courses/[courseId]/route.ts': () =>
    import('../v1/workspaces/[wsId]/courses/[courseId]/route'),
  'v1/workspaces/[wsId]/courses/route.ts': () =>
    import('../v1/workspaces/[wsId]/courses/route'),
  'v1/workspaces/[wsId]/crawl/route.ts': () =>
    import('../v1/workspaces/[wsId]/crawl/route'),
  'v1/workspaces/[wsId]/crawlers/route.ts': () =>
    import('../v1/workspaces/[wsId]/crawlers/route'),
  'v1/workspaces/[wsId]/crawlers/status/route.ts': () =>
    import('../v1/workspaces/[wsId]/crawlers/status/route'),
  'v1/workspaces/[wsId]/cron/jobs/[jobId]/route.ts': () =>
    import('../v1/workspaces/[wsId]/cron/jobs/[jobId]/route'),
  'v1/workspaces/[wsId]/cron/jobs/route.ts': () =>
    import('../v1/workspaces/[wsId]/cron/jobs/route'),
  'v1/workspaces/[wsId]/datasets/[datasetId]/cells/route.ts': () =>
    import('../v1/workspaces/[wsId]/datasets/[datasetId]/cells/route'),
  'v1/workspaces/[wsId]/datasets/[datasetId]/columns/[columnId]/route.ts': () =>
    import(
      '../v1/workspaces/[wsId]/datasets/[datasetId]/columns/[columnId]/route'
    ),
  'v1/workspaces/[wsId]/datasets/[datasetId]/columns/route.ts': () =>
    import('../v1/workspaces/[wsId]/datasets/[datasetId]/columns/route'),
  'v1/workspaces/[wsId]/datasets/[datasetId]/columns/sync/route.ts': () =>
    import('../v1/workspaces/[wsId]/datasets/[datasetId]/columns/sync/route'),
  'v1/workspaces/[wsId]/datasets/[datasetId]/duplicates/detect/route.ts': () =>
    import(
      '../v1/workspaces/[wsId]/datasets/[datasetId]/duplicates/detect/route'
    ),
  'v1/workspaces/[wsId]/datasets/[datasetId]/duplicates/remove/route.ts': () =>
    import(
      '../v1/workspaces/[wsId]/datasets/[datasetId]/duplicates/remove/route'
    ),
  'v1/workspaces/[wsId]/datasets/[datasetId]/full/route.ts': () =>
    import('../v1/workspaces/[wsId]/datasets/[datasetId]/full/route'),
  'v1/workspaces/[wsId]/datasets/[datasetId]/route.ts': () =>
    import('../v1/workspaces/[wsId]/datasets/[datasetId]/route'),
  'v1/workspaces/[wsId]/datasets/[datasetId]/rows/clear/route.ts': () =>
    import('../v1/workspaces/[wsId]/datasets/[datasetId]/rows/clear/route'),
  'v1/workspaces/[wsId]/datasets/[datasetId]/rows/route.ts': () =>
    import('../v1/workspaces/[wsId]/datasets/[datasetId]/rows/route'),
  'v1/workspaces/[wsId]/datasets/[datasetId]/rows/sync/route.ts': () =>
    import('../v1/workspaces/[wsId]/datasets/[datasetId]/rows/sync/route'),
  'v1/workspaces/[wsId]/datasets/route.ts': () =>
    import('../v1/workspaces/[wsId]/datasets/route'),
  'v1/workspaces/[wsId]/deleted/route.ts': () =>
    import('../v1/workspaces/[wsId]/deleted/route'),
  'v1/workspaces/[wsId]/documents/[documentId]/route.ts': () =>
    import('../v1/workspaces/[wsId]/documents/[documentId]/route'),
  'v1/workspaces/[wsId]/documents/route.ts': () =>
    import('../v1/workspaces/[wsId]/documents/route'),
  'v1/workspaces/[wsId]/education/access/route.ts': () =>
    import('../v1/workspaces/[wsId]/education/access/route'),
  'v1/workspaces/[wsId]/education/attempts/[attemptId]/route.ts': () =>
    import('../v1/workspaces/[wsId]/education/attempts/[attemptId]/route'),
  'v1/workspaces/[wsId]/education/attempts/route.ts': () =>
    import('../v1/workspaces/[wsId]/education/attempts/route'),
  'v1/workspaces/[wsId]/education/valsea/audio/upload-url/route.ts': () =>
    import('../v1/workspaces/[wsId]/education/valsea/audio/upload-url/route'),
  'v1/workspaces/[wsId]/education/valsea/route.ts': () =>
    import('../v1/workspaces/[wsId]/education/valsea/route'),
  'v1/workspaces/[wsId]/education/valsea/scenario/route.ts': () =>
    import('../v1/workspaces/[wsId]/education/valsea/scenario/route'),
  'v1/workspaces/[wsId]/education/valsea/speech/route.ts': () =>
    import('../v1/workspaces/[wsId]/education/valsea/speech/route'),
  'v1/workspaces/[wsId]/education/valsea/validate-key/route.ts': () =>
    import('../v1/workspaces/[wsId]/education/valsea/validate-key/route'),
  'v1/workspaces/[wsId]/encryption/fix/route.ts': () =>
    import('../v1/workspaces/[wsId]/encryption/fix/route'),
  'v1/workspaces/[wsId]/encryption/migrate/route.ts': () =>
    import('../v1/workspaces/[wsId]/encryption/migrate/route'),
  'v1/workspaces/[wsId]/encryption/route.ts': () =>
    import('../v1/workspaces/[wsId]/encryption/route'),
  'v1/workspaces/[wsId]/external-apps/cron/executions/route.ts': () =>
    import('../v1/workspaces/[wsId]/external-apps/cron/executions/route'),
  'v1/workspaces/[wsId]/external-apps/cron/jobs/[jobKey]/executions/route.ts':
    () =>
      import(
        '../v1/workspaces/[wsId]/external-apps/cron/jobs/[jobKey]/executions/route'
      ),
  'v1/workspaces/[wsId]/external-apps/cron/jobs/[jobKey]/route.ts': () =>
    import('../v1/workspaces/[wsId]/external-apps/cron/jobs/[jobKey]/route'),
  'v1/workspaces/[wsId]/external-apps/cron/jobs/[jobKey]/run-now/route.ts':
    () =>
      import(
        '../v1/workspaces/[wsId]/external-apps/cron/jobs/[jobKey]/run-now/route'
      ),
  'v1/workspaces/[wsId]/external-apps/cron/route.ts': () =>
    import('../v1/workspaces/[wsId]/external-apps/cron/route'),
  'v1/workspaces/[wsId]/external-apps/cron/setup/route.ts': () =>
    import('../v1/workspaces/[wsId]/external-apps/cron/setup/route'),
  'v1/workspaces/[wsId]/external-apps/members/[userId]/role/route.ts': () =>
    import('../v1/workspaces/[wsId]/external-apps/members/[userId]/role/route'),
  'v1/workspaces/[wsId]/external-apps/members/access/route.ts': () =>
    import('../v1/workspaces/[wsId]/external-apps/members/access/route'),
  'v1/workspaces/[wsId]/external-apps/members/default-admin/route.ts': () =>
    import('../v1/workspaces/[wsId]/external-apps/members/default-admin/route'),
  'v1/workspaces/[wsId]/external-apps/members/invitations/route.ts': () =>
    import('../v1/workspaces/[wsId]/external-apps/members/invitations/route'),
  'v1/workspaces/[wsId]/external-apps/members/route.ts': () =>
    import('../v1/workspaces/[wsId]/external-apps/members/route'),
  'v1/workspaces/[wsId]/external-projects/assets/[assetId]/route.ts': () =>
    import('../v1/workspaces/[wsId]/external-projects/assets/[assetId]/route'),
  'v1/workspaces/[wsId]/external-projects/assets/[assetId]/webgl/[...assetPath]/route.ts':
    () =>
      import(
        '../v1/workspaces/[wsId]/external-projects/assets/[assetId]/webgl/[...assetPath]/route'
      ),
  'v1/workspaces/[wsId]/external-projects/assets/route.ts': () =>
    import('../v1/workspaces/[wsId]/external-projects/assets/route'),
  'v1/workspaces/[wsId]/external-projects/assets/upload-url/route.ts': () =>
    import('../v1/workspaces/[wsId]/external-projects/assets/upload-url/route'),
  'v1/workspaces/[wsId]/external-projects/blocks/[blockId]/route.ts': () =>
    import('../v1/workspaces/[wsId]/external-projects/blocks/[blockId]/route'),
  'v1/workspaces/[wsId]/external-projects/blocks/route.ts': () =>
    import('../v1/workspaces/[wsId]/external-projects/blocks/route'),
  'v1/workspaces/[wsId]/external-projects/collections/[collectionId]/route.ts':
    () =>
      import(
        '../v1/workspaces/[wsId]/external-projects/collections/[collectionId]/route'
      ),
  'v1/workspaces/[wsId]/external-projects/collections/route.ts': () =>
    import('../v1/workspaces/[wsId]/external-projects/collections/route'),
  'v1/workspaces/[wsId]/external-projects/delivery/route.ts': () =>
    import('../v1/workspaces/[wsId]/external-projects/delivery/route'),
  'v1/workspaces/[wsId]/external-projects/entries/[entryId]/duplicate/route.ts':
    () =>
      import(
        '../v1/workspaces/[wsId]/external-projects/entries/[entryId]/duplicate/route'
      ),
  'v1/workspaces/[wsId]/external-projects/entries/[entryId]/publish/route.ts':
    () =>
      import(
        '../v1/workspaces/[wsId]/external-projects/entries/[entryId]/publish/route'
      ),
  'v1/workspaces/[wsId]/external-projects/entries/[entryId]/route.ts': () =>
    import('../v1/workspaces/[wsId]/external-projects/entries/[entryId]/route'),
  'v1/workspaces/[wsId]/external-projects/entries/batch/route.ts': () =>
    import('../v1/workspaces/[wsId]/external-projects/entries/batch/route'),
  'v1/workspaces/[wsId]/external-projects/entries/bulk/route.ts': () =>
    import('../v1/workspaces/[wsId]/external-projects/entries/bulk/route'),
  'v1/workspaces/[wsId]/external-projects/entries/route.ts': () =>
    import('../v1/workspaces/[wsId]/external-projects/entries/route'),
  'v1/workspaces/[wsId]/external-projects/field-definitions/[fieldDefinitionId]/route.ts':
    () =>
      import(
        '../v1/workspaces/[wsId]/external-projects/field-definitions/[fieldDefinitionId]/route'
      ),
  'v1/workspaces/[wsId]/external-projects/field-definitions/route.ts': () =>
    import('../v1/workspaces/[wsId]/external-projects/field-definitions/route'),
  'v1/workspaces/[wsId]/external-projects/import/route.ts': () =>
    import('../v1/workspaces/[wsId]/external-projects/import/route'),
  'v1/workspaces/[wsId]/external-projects/members/access/route.ts': () =>
    import('../v1/workspaces/[wsId]/external-projects/members/access/route'),
  'v1/workspaces/[wsId]/external-projects/members/enhanced/route.ts': () =>
    import('../v1/workspaces/[wsId]/external-projects/members/enhanced/route'),
  'v1/workspaces/[wsId]/external-projects/members/invite/route.ts': () =>
    import('../v1/workspaces/[wsId]/external-projects/members/invite/route'),
  'v1/workspaces/[wsId]/external-projects/members/roles/[roleId]/members/[userId]/route.ts':
    () =>
      import(
        '../v1/workspaces/[wsId]/external-projects/members/roles/[roleId]/members/[userId]/route'
      ),
  'v1/workspaces/[wsId]/external-projects/members/roles/[roleId]/members/route.ts':
    () =>
      import(
        '../v1/workspaces/[wsId]/external-projects/members/roles/[roleId]/members/route'
      ),
  'v1/workspaces/[wsId]/external-projects/members/roles/[roleId]/route.ts':
    () =>
      import(
        '../v1/workspaces/[wsId]/external-projects/members/roles/[roleId]/route'
      ),
  'v1/workspaces/[wsId]/external-projects/members/roles/default/route.ts': () =>
    import(
      '../v1/workspaces/[wsId]/external-projects/members/roles/default/route'
    ),
  'v1/workspaces/[wsId]/external-projects/members/roles/route.ts': () =>
    import('../v1/workspaces/[wsId]/external-projects/members/roles/route'),
  'v1/workspaces/[wsId]/external-projects/members/route.ts': () =>
    import('../v1/workspaces/[wsId]/external-projects/members/route'),
  'v1/workspaces/[wsId]/external-projects/route.ts': () =>
    import('../v1/workspaces/[wsId]/external-projects/route'),
  'v1/workspaces/[wsId]/external-projects/setup/route.ts': () =>
    import('../v1/workspaces/[wsId]/external-projects/setup/route'),
  'v1/workspaces/[wsId]/external-projects/storage-analytics/route.ts': () =>
    import('../v1/workspaces/[wsId]/external-projects/storage-analytics/route'),
  'v1/workspaces/[wsId]/external-projects/storage/route.ts': () =>
    import('../v1/workspaces/[wsId]/external-projects/storage/route'),
  'v1/workspaces/[wsId]/external-projects/summary/route.ts': () =>
    import('../v1/workspaces/[wsId]/external-projects/summary/route'),
  'v1/workspaces/[wsId]/external-projects/sync/apply/route.ts': () =>
    import('../v1/workspaces/[wsId]/external-projects/sync/apply/route'),
  'v1/workspaces/[wsId]/external-projects/sync/diff/route.ts': () =>
    import('../v1/workspaces/[wsId]/external-projects/sync/diff/route'),
  'v1/workspaces/[wsId]/external-projects/sync/snapshot/route.ts': () =>
    import('../v1/workspaces/[wsId]/external-projects/sync/snapshot/route'),
  'v1/workspaces/[wsId]/external-projects/webgl-packages/extract-callback/route.ts':
    () =>
      import(
        '../v1/workspaces/[wsId]/external-projects/webgl-packages/extract-callback/route'
      ),
  'v1/workspaces/[wsId]/external-projects/webgl-packages/finalize/route.ts':
    () =>
      import(
        '../v1/workspaces/[wsId]/external-projects/webgl-packages/finalize/route'
      ),
  'v1/workspaces/[wsId]/external-projects/webgl-packages/upload-url/route.ts':
    () =>
      import(
        '../v1/workspaces/[wsId]/external-projects/webgl-packages/upload-url/route'
      ),
  'v1/workspaces/[wsId]/external-projects/webgl-packages/upload/route.ts': () =>
    import(
      '../v1/workspaces/[wsId]/external-projects/webgl-packages/upload/route'
    ),
  'v1/workspaces/[wsId]/finance/budgets/[budgetId]/route.ts': () =>
    import('../v1/workspaces/[wsId]/finance/budgets/[budgetId]/route'),
  'v1/workspaces/[wsId]/finance/budgets/route.ts': () =>
    import('../v1/workspaces/[wsId]/finance/budgets/route'),
  'v1/workspaces/[wsId]/finance/budgets/status/route.ts': () =>
    import('../v1/workspaces/[wsId]/finance/budgets/status/route'),
  'v1/workspaces/[wsId]/finance/debts/[debtId]/route.ts': () =>
    import('../v1/workspaces/[wsId]/finance/debts/[debtId]/route'),
  'v1/workspaces/[wsId]/finance/debts/route.ts': () =>
    import('../v1/workspaces/[wsId]/finance/debts/route'),
  'v1/workspaces/[wsId]/finance/debts/summary/route.ts': () =>
    import('../v1/workspaces/[wsId]/finance/debts/summary/route'),
  'v1/workspaces/[wsId]/finance/filter-users/route.ts': () =>
    import('../v1/workspaces/[wsId]/finance/filter-users/route'),
  'v1/workspaces/[wsId]/finance/invoices/[invoiceId]/route.ts': () =>
    import('../v1/workspaces/[wsId]/finance/invoices/[invoiceId]/route'),
  'v1/workspaces/[wsId]/finance/invoices/analytics/route.ts': () =>
    import('../v1/workspaces/[wsId]/finance/invoices/analytics/route'),
  'v1/workspaces/[wsId]/finance/invoices/count/route.ts': () =>
    import('../v1/workspaces/[wsId]/finance/invoices/count/route'),
  'v1/workspaces/[wsId]/finance/invoices/pending/route.ts': () =>
    import('../v1/workspaces/[wsId]/finance/invoices/pending/route'),
  'v1/workspaces/[wsId]/finance/invoices/route.ts': () =>
    import('../v1/workspaces/[wsId]/finance/invoices/route'),
  'v1/workspaces/[wsId]/finance/invoices/subscription/context/route.ts': () =>
    import(
      '../v1/workspaces/[wsId]/finance/invoices/subscription/context/route'
    ),
  'v1/workspaces/[wsId]/finance/invoices/subscription/route.ts': () =>
    import('../v1/workspaces/[wsId]/finance/invoices/subscription/route'),
  'v1/workspaces/[wsId]/finance/recurring-transactions/[recurringTransactionId]/route.ts':
    () =>
      import(
        '../v1/workspaces/[wsId]/finance/recurring-transactions/[recurringTransactionId]/route'
      ),
  'v1/workspaces/[wsId]/finance/recurring-transactions/route.ts': () =>
    import('../v1/workspaces/[wsId]/finance/recurring-transactions/route'),
  'v1/workspaces/[wsId]/finance/recurring-transactions/upcoming/route.ts': () =>
    import(
      '../v1/workspaces/[wsId]/finance/recurring-transactions/upcoming/route'
    ),
  'v1/workspaces/[wsId]/finance/wallets/expense/count/route.ts': () =>
    import('../v1/workspaces/[wsId]/finance/wallets/expense/count/route'),
  'v1/workspaces/[wsId]/finance/wallets/expense/sum/route.ts': () =>
    import('../v1/workspaces/[wsId]/finance/wallets/expense/sum/route'),
  'v1/workspaces/[wsId]/finance/wallets/income/count/route.ts': () =>
    import('../v1/workspaces/[wsId]/finance/wallets/income/count/route'),
  'v1/workspaces/[wsId]/finance/wallets/income/sum/route.ts': () =>
    import('../v1/workspaces/[wsId]/finance/wallets/income/sum/route'),
  'v1/workspaces/[wsId]/flashcards/[flashcardId]/route.ts': () =>
    import('../v1/workspaces/[wsId]/flashcards/[flashcardId]/route'),
  'v1/workspaces/[wsId]/flashcards/route.ts': () =>
    import('../v1/workspaces/[wsId]/flashcards/route'),
  'v1/workspaces/[wsId]/forms/[formId]/analytics/route.ts': () =>
    import('../v1/workspaces/[wsId]/forms/[formId]/analytics/route'),
  'v1/workspaces/[wsId]/forms/[formId]/archive/route.ts': () =>
    import('../v1/workspaces/[wsId]/forms/[formId]/archive/route'),
  'v1/workspaces/[wsId]/forms/[formId]/copy/route.ts': () =>
    import('../v1/workspaces/[wsId]/forms/[formId]/copy/route'),
  'v1/workspaces/[wsId]/forms/[formId]/export/route.ts': () =>
    import('../v1/workspaces/[wsId]/forms/[formId]/export/route'),
  'v1/workspaces/[wsId]/forms/[formId]/responses/export/route.ts': () =>
    import('../v1/workspaces/[wsId]/forms/[formId]/responses/export/route'),
  'v1/workspaces/[wsId]/forms/[formId]/responses/route.ts': () =>
    import('../v1/workspaces/[wsId]/forms/[formId]/responses/route'),
  'v1/workspaces/[wsId]/forms/[formId]/route.ts': () =>
    import('../v1/workspaces/[wsId]/forms/[formId]/route'),
  'v1/workspaces/[wsId]/forms/[formId]/share-link/route.ts': () =>
    import('../v1/workspaces/[wsId]/forms/[formId]/share-link/route'),
  'v1/workspaces/[wsId]/forms/media/route.ts': () =>
    import('../v1/workspaces/[wsId]/forms/media/route'),
  'v1/workspaces/[wsId]/forms/route.ts': () =>
    import('../v1/workspaces/[wsId]/forms/route'),
  'v1/workspaces/[wsId]/group-tags/[tagId]/route.ts': () =>
    import('../v1/workspaces/[wsId]/group-tags/[tagId]/route'),
  'v1/workspaces/[wsId]/group-tags/[tagId]/user-groups/[groupId]/route.ts':
    () =>
      import(
        '../v1/workspaces/[wsId]/group-tags/[tagId]/user-groups/[groupId]/route'
      ),
  'v1/workspaces/[wsId]/group-tags/[tagId]/user-groups/route.ts': () =>
    import('../v1/workspaces/[wsId]/group-tags/[tagId]/user-groups/route'),
  'v1/workspaces/[wsId]/group-tags/route.ts': () =>
    import('../v1/workspaces/[wsId]/group-tags/route'),
  'v1/workspaces/[wsId]/integrations/sepay/disconnect/route.ts': () =>
    import('../v1/workspaces/[wsId]/integrations/sepay/disconnect/route'),
  'v1/workspaces/[wsId]/integrations/sepay/endpoints/[id]/rotate/route.ts':
    () =>
      import(
        '../v1/workspaces/[wsId]/integrations/sepay/endpoints/[id]/rotate/route'
      ),
  'v1/workspaces/[wsId]/integrations/sepay/endpoints/[id]/route.ts': () =>
    import('../v1/workspaces/[wsId]/integrations/sepay/endpoints/[id]/route'),
  'v1/workspaces/[wsId]/integrations/sepay/endpoints/route.ts': () =>
    import('../v1/workspaces/[wsId]/integrations/sepay/endpoints/route'),
  'v1/workspaces/[wsId]/integrations/sepay/oauth/callback/route.ts': () =>
    import('../v1/workspaces/[wsId]/integrations/sepay/oauth/callback/route'),
  'v1/workspaces/[wsId]/integrations/sepay/oauth/start/route.ts': () =>
    import('../v1/workspaces/[wsId]/integrations/sepay/oauth/start/route'),
  'v1/workspaces/[wsId]/integrations/sepay/provision-webhooks/route.ts': () =>
    import(
      '../v1/workspaces/[wsId]/integrations/sepay/provision-webhooks/route'
    ),
  'v1/workspaces/[wsId]/integrations/sepay/sync-bank-accounts/route.ts': () =>
    import(
      '../v1/workspaces/[wsId]/integrations/sepay/sync-bank-accounts/route'
    ),
  'v1/workspaces/[wsId]/inventory/access/route.ts': () =>
    import('../v1/workspaces/[wsId]/inventory/access/route'),
  'v1/workspaces/[wsId]/inventory/audit-logs/route.ts': () =>
    import('../v1/workspaces/[wsId]/inventory/audit-logs/route'),
  'v1/workspaces/[wsId]/inventory/manufacturers/route.ts': () =>
    import('../v1/workspaces/[wsId]/inventory/manufacturers/route'),
  'v1/workspaces/[wsId]/inventory/media/read-url/route.ts': () =>
    import('../v1/workspaces/[wsId]/inventory/media/read-url/route'),
  'v1/workspaces/[wsId]/inventory/media/upload-url/route.ts': () =>
    import('../v1/workspaces/[wsId]/inventory/media/upload-url/route'),
  'v1/workspaces/[wsId]/inventory/overview/route.ts': () =>
    import('../v1/workspaces/[wsId]/inventory/overview/route'),
  'v1/workspaces/[wsId]/inventory/owners/route.ts': () =>
    import('../v1/workspaces/[wsId]/inventory/owners/route'),
  'v1/workspaces/[wsId]/inventory/products/route.ts': () =>
    import('../v1/workspaces/[wsId]/inventory/products/route'),
  'v1/workspaces/[wsId]/inventory/realtime/route.ts': () =>
    import('../v1/workspaces/[wsId]/inventory/realtime/route'),
  'v1/workspaces/[wsId]/inventory/sales/[saleId]/route.ts': () =>
    import('../v1/workspaces/[wsId]/inventory/sales/[saleId]/route'),
  'v1/workspaces/[wsId]/inventory/sales/by-product/route.ts': () =>
    import('../v1/workspaces/[wsId]/inventory/sales/by-product/route'),
  'v1/workspaces/[wsId]/inventory/sales/route.ts': () =>
    import('../v1/workspaces/[wsId]/inventory/sales/route'),
  'v1/workspaces/[wsId]/logo/route.ts': () =>
    import('../v1/workspaces/[wsId]/logo/route'),
  'v1/workspaces/[wsId]/logo/upload-url/route.ts': () =>
    import('../v1/workspaces/[wsId]/logo/upload-url/route'),
  'v1/workspaces/[wsId]/meet/plans/route.ts': () =>
    import('../v1/workspaces/[wsId]/meet/plans/route'),
  'v1/workspaces/[wsId]/meetings/[meetingId]/realtime-token/route.ts': () =>
    import('../v1/workspaces/[wsId]/meetings/[meetingId]/realtime-token/route'),
  'v1/workspaces/[wsId]/meetings/[meetingId]/record/route.ts': () =>
    import('../v1/workspaces/[wsId]/meetings/[meetingId]/record/route'),
  'v1/workspaces/[wsId]/meetings/[meetingId]/recordings/[sessionId]/chunks/route.ts':
    () =>
      import(
        '../v1/workspaces/[wsId]/meetings/[meetingId]/recordings/[sessionId]/chunks/route'
      ),
  'v1/workspaces/[wsId]/meetings/[meetingId]/recordings/[sessionId]/play/route.ts':
    () =>
      import(
        '../v1/workspaces/[wsId]/meetings/[meetingId]/recordings/[sessionId]/play/route'
      ),
  'v1/workspaces/[wsId]/meetings/[meetingId]/recordings/[sessionId]/route.ts':
    () =>
      import(
        '../v1/workspaces/[wsId]/meetings/[meetingId]/recordings/[sessionId]/route'
      ),
  'v1/workspaces/[wsId]/meetings/[meetingId]/recordings/[sessionId]/upload/route.ts':
    () =>
      import(
        '../v1/workspaces/[wsId]/meetings/[meetingId]/recordings/[sessionId]/upload/route'
      ),
  'v1/workspaces/[wsId]/meetings/[meetingId]/recordings/route.ts': () =>
    import('../v1/workspaces/[wsId]/meetings/[meetingId]/recordings/route'),
  'v1/workspaces/[wsId]/meetings/[meetingId]/route.ts': () =>
    import('../v1/workspaces/[wsId]/meetings/[meetingId]/route'),
  'v1/workspaces/[wsId]/meetings/[meetingId]/stream/route.ts': () =>
    import('../v1/workspaces/[wsId]/meetings/[meetingId]/stream/route'),
  'v1/workspaces/[wsId]/meetings/route.ts': () =>
    import('../v1/workspaces/[wsId]/meetings/route'),
  'v1/workspaces/[wsId]/members/batch-invite/route.ts': () =>
    import('../v1/workspaces/[wsId]/members/batch-invite/route'),
  'v1/workspaces/[wsId]/members/route.ts': () =>
    import('../v1/workspaces/[wsId]/members/route'),
  'v1/workspaces/[wsId]/Mention/route.ts': () =>
    import('../v1/workspaces/[wsId]/Mention/route'),
  'v1/workspaces/[wsId]/mobile/module-flags/route.ts': () =>
    import('../v1/workspaces/[wsId]/mobile/module-flags/route'),
  'v1/workspaces/[wsId]/notes/[noteId]/convert-to-project/route.ts': () =>
    import('../v1/workspaces/[wsId]/notes/[noteId]/convert-to-project/route'),
  'v1/workspaces/[wsId]/notes/[noteId]/route.ts': () =>
    import('../v1/workspaces/[wsId]/notes/[noteId]/route'),
  'v1/workspaces/[wsId]/notes/route.ts': () =>
    import('../v1/workspaces/[wsId]/notes/route'),
  'v1/workspaces/[wsId]/posts/bootstrap/route.ts': () =>
    import('../v1/workspaces/[wsId]/posts/bootstrap/route'),
  'v1/workspaces/[wsId]/posts/filter-options/route.ts': () =>
    import('../v1/workspaces/[wsId]/posts/filter-options/route'),
  'v1/workspaces/[wsId]/posts/force-send/route.ts': () =>
    import('../v1/workspaces/[wsId]/posts/force-send/route'),
  'v1/workspaces/[wsId]/posts/permissions/route.ts': () =>
    import('../v1/workspaces/[wsId]/posts/permissions/route'),
  'v1/workspaces/[wsId]/posts/route.ts': () =>
    import('../v1/workspaces/[wsId]/posts/route'),
  'v1/workspaces/[wsId]/posts/status/route.ts': () =>
    import('../v1/workspaces/[wsId]/posts/status/route'),
  'v1/workspaces/[wsId]/product-categories/[categoryId]/route.ts': () =>
    import('../v1/workspaces/[wsId]/product-categories/[categoryId]/route'),
  'v1/workspaces/[wsId]/product-categories/route.ts': () =>
    import('../v1/workspaces/[wsId]/product-categories/route'),
  'v1/workspaces/[wsId]/product-suppliers/[supplierId]/route.ts': () =>
    import('../v1/workspaces/[wsId]/product-suppliers/[supplierId]/route'),
  'v1/workspaces/[wsId]/product-suppliers/route.ts': () =>
    import('../v1/workspaces/[wsId]/product-suppliers/route'),
  'v1/workspaces/[wsId]/product-units/[unitId]/route.ts': () =>
    import('../v1/workspaces/[wsId]/product-units/[unitId]/route'),
  'v1/workspaces/[wsId]/product-units/route.ts': () =>
    import('../v1/workspaces/[wsId]/product-units/route'),
  'v1/workspaces/[wsId]/product-warehouses/[warehouseId]/route.ts': () =>
    import('../v1/workspaces/[wsId]/product-warehouses/[warehouseId]/route'),
  'v1/workspaces/[wsId]/product-warehouses/route.ts': () =>
    import('../v1/workspaces/[wsId]/product-warehouses/route'),
  'v1/workspaces/[wsId]/products/[productId]/inventory/route.ts': () =>
    import('../v1/workspaces/[wsId]/products/[productId]/inventory/route'),
  'v1/workspaces/[wsId]/products/[productId]/route.ts': () =>
    import('../v1/workspaces/[wsId]/products/[productId]/route'),
  'v1/workspaces/[wsId]/products/count/route.ts': () =>
    import('../v1/workspaces/[wsId]/products/count/route'),
  'v1/workspaces/[wsId]/products/options/route.ts': () =>
    import('../v1/workspaces/[wsId]/products/options/route'),
  'v1/workspaces/[wsId]/products/route.ts': () =>
    import('../v1/workspaces/[wsId]/products/route'),
  'v1/workspaces/[wsId]/promotions/[promotionId]/route.ts': () =>
    import('../v1/workspaces/[wsId]/promotions/[promotionId]/route'),
  'v1/workspaces/[wsId]/promotions/count/route.ts': () =>
    import('../v1/workspaces/[wsId]/promotions/count/route'),
  'v1/workspaces/[wsId]/promotions/referral-settings/route.ts': () =>
    import('../v1/workspaces/[wsId]/promotions/referral-settings/route'),
  'v1/workspaces/[wsId]/promotions/route.ts': () =>
    import('../v1/workspaces/[wsId]/promotions/route'),
  'v1/workspaces/[wsId]/quiz-sets/[setId]/linked-modules/route.ts': () =>
    import('../v1/workspaces/[wsId]/quiz-sets/[setId]/linked-modules/route'),
  'v1/workspaces/[wsId]/quiz-sets/[setId]/modules/[moduleId]/route.ts': () =>
    import(
      '../v1/workspaces/[wsId]/quiz-sets/[setId]/modules/[moduleId]/route'
    ),
  'v1/workspaces/[wsId]/quiz-sets/[setId]/modules/route.ts': () =>
    import('../v1/workspaces/[wsId]/quiz-sets/[setId]/modules/route'),
  'v1/workspaces/[wsId]/quiz-sets/[setId]/quizzes/route.ts': () =>
    import('../v1/workspaces/[wsId]/quiz-sets/[setId]/quizzes/route'),
  'v1/workspaces/[wsId]/quiz-sets/[setId]/route.ts': () =>
    import('../v1/workspaces/[wsId]/quiz-sets/[setId]/route'),
  'v1/workspaces/[wsId]/quiz-sets/route.ts': () =>
    import('../v1/workspaces/[wsId]/quiz-sets/route'),
  'v1/workspaces/[wsId]/quizzes/[quizId]/route.ts': () =>
    import('../v1/workspaces/[wsId]/quizzes/[quizId]/route'),
  'v1/workspaces/[wsId]/quizzes/route.ts': () =>
    import('../v1/workspaces/[wsId]/quizzes/route'),
  'v1/workspaces/[wsId]/roles/[roleId]/members/[userId]/route.ts': () =>
    import('../v1/workspaces/[wsId]/roles/[roleId]/members/[userId]/route'),
  'v1/workspaces/[wsId]/roles/[roleId]/members/route.ts': () =>
    import('../v1/workspaces/[wsId]/roles/[roleId]/members/route'),
  'v1/workspaces/[wsId]/roles/[roleId]/route.ts': () =>
    import('../v1/workspaces/[wsId]/roles/[roleId]/route'),
  'v1/workspaces/[wsId]/roles/[roleId]/wallets/[walletId]/route.ts': () =>
    import('../v1/workspaces/[wsId]/roles/[roleId]/wallets/[walletId]/route'),
  'v1/workspaces/[wsId]/roles/[roleId]/wallets/route.ts': () =>
    import('../v1/workspaces/[wsId]/roles/[roleId]/wallets/route'),
  'v1/workspaces/[wsId]/roles/default/route.ts': () =>
    import('../v1/workspaces/[wsId]/roles/default/route'),
  'v1/workspaces/[wsId]/roles/route.ts': () =>
    import('../v1/workspaces/[wsId]/roles/route'),
  'v1/workspaces/[wsId]/route.ts': () =>
    import('../v1/workspaces/[wsId]/route'),
  'v1/workspaces/[wsId]/settings/[configId]/route.ts': () =>
    import('../v1/workspaces/[wsId]/settings/[configId]/route'),
  'v1/workspaces/[wsId]/settings/approvals/pending-summary/route.ts': () =>
    import('../v1/workspaces/[wsId]/settings/approvals/pending-summary/route'),
  'v1/workspaces/[wsId]/settings/configs/route.ts': () =>
    import('../v1/workspaces/[wsId]/settings/configs/route'),
  'v1/workspaces/[wsId]/settings/members/route.ts': () =>
    import('../v1/workspaces/[wsId]/settings/members/route'),
  'v1/workspaces/[wsId]/settings/permissions/check/route.ts': () =>
    import('../v1/workspaces/[wsId]/settings/permissions/check/route'),
  'v1/workspaces/[wsId]/settings/permissions/route.ts': () =>
    import('../v1/workspaces/[wsId]/settings/permissions/route'),
  'v1/workspaces/[wsId]/settings/permissions/setup-status/route.ts': () =>
    import('../v1/workspaces/[wsId]/settings/permissions/setup-status/route'),
  'v1/workspaces/[wsId]/settings/route.ts': () =>
    import('../v1/workspaces/[wsId]/settings/route'),
  'v1/workspaces/[wsId]/slides/[slideId]/route.ts': () =>
    import('../v1/workspaces/[wsId]/slides/[slideId]/route'),
  'v1/workspaces/[wsId]/slides/route.ts': () =>
    import('../v1/workspaces/[wsId]/slides/route'),
  'v1/workspaces/[wsId]/storage/analytics/route.ts': () =>
    import('../v1/workspaces/[wsId]/storage/analytics/route'),
  'v1/workspaces/[wsId]/storage/auto-extract/route.ts': () =>
    import('../v1/workspaces/[wsId]/storage/auto-extract/route'),
  'v1/workspaces/[wsId]/storage/export-links/route.ts': () =>
    import('../v1/workspaces/[wsId]/storage/export-links/route'),
  'v1/workspaces/[wsId]/storage/export/[token]/[...assetPath]/route.ts': () =>
    import(
      '../v1/workspaces/[wsId]/storage/export/[token]/[...assetPath]/route'
    ),
  'v1/workspaces/[wsId]/storage/finalize-upload/route.ts': () =>
    import('../v1/workspaces/[wsId]/storage/finalize-upload/route'),
  'v1/workspaces/[wsId]/storage/folders/route.ts': () =>
    import('../v1/workspaces/[wsId]/storage/folders/route'),
  'v1/workspaces/[wsId]/storage/list/route.ts': () =>
    import('../v1/workspaces/[wsId]/storage/list/route'),
  'v1/workspaces/[wsId]/storage/migrate/route.ts': () =>
    import('../v1/workspaces/[wsId]/storage/migrate/route'),
  'v1/workspaces/[wsId]/storage/object/[id]/route.ts': () =>
    import('../v1/workspaces/[wsId]/storage/object/[id]/route'),
  'v1/workspaces/[wsId]/storage/object/route.ts': () =>
    import('../v1/workspaces/[wsId]/storage/object/route'),
  'v1/workspaces/[wsId]/storage/rename/route.ts': () =>
    import('../v1/workspaces/[wsId]/storage/rename/route'),
  'v1/workspaces/[wsId]/storage/rollout-state/route.ts': () =>
    import('../v1/workspaces/[wsId]/storage/rollout-state/route'),
  'v1/workspaces/[wsId]/storage/share/route.ts': () =>
    import('../v1/workspaces/[wsId]/storage/share/route'),
  'v1/workspaces/[wsId]/storage/upload-url/route.ts': () =>
    import('../v1/workspaces/[wsId]/storage/upload-url/route'),
  'v1/workspaces/[wsId]/storage/upload/route.ts': () =>
    import('../v1/workspaces/[wsId]/storage/upload/route'),
  'v1/workspaces/[wsId]/teach/courses/[courseId]/attendance/route.ts': () =>
    import('../v1/workspaces/[wsId]/teach/courses/[courseId]/attendance/route'),
  'v1/workspaces/[wsId]/teach/courses/[courseId]/indicators/route.ts': () =>
    import('../v1/workspaces/[wsId]/teach/courses/[courseId]/indicators/route'),
  'v1/workspaces/[wsId]/teach/courses/[courseId]/members/[userId]/route.ts':
    () =>
      import(
        '../v1/workspaces/[wsId]/teach/courses/[courseId]/members/[userId]/route'
      ),
  'v1/workspaces/[wsId]/teach/courses/[courseId]/members/route.ts': () =>
    import('../v1/workspaces/[wsId]/teach/courses/[courseId]/members/route'),
  'v1/workspaces/[wsId]/teach/courses/[courseId]/posts/route.ts': () =>
    import('../v1/workspaces/[wsId]/teach/courses/[courseId]/posts/route'),
  'v1/workspaces/[wsId]/teach/courses/[courseId]/reports/route.ts': () =>
    import('../v1/workspaces/[wsId]/teach/courses/[courseId]/reports/route'),
  'v1/workspaces/[wsId]/teach/courses/[courseId]/tests/[testId]/questions/route.ts':
    () =>
      import(
        '../v1/workspaces/[wsId]/teach/courses/[courseId]/tests/[testId]/questions/route'
      ),
  'v1/workspaces/[wsId]/teach/courses/[courseId]/tests/[testId]/submissions/[attemptId]/route.ts':
    () =>
      import(
        '../v1/workspaces/[wsId]/teach/courses/[courseId]/tests/[testId]/submissions/[attemptId]/route'
      ),
  'v1/workspaces/[wsId]/teach/courses/[courseId]/tests/[testId]/submissions/route.ts':
    () =>
      import(
        '../v1/workspaces/[wsId]/teach/courses/[courseId]/tests/[testId]/submissions/route'
      ),
  'v1/workspaces/[wsId]/teach/courses/[courseId]/tests/route.ts': () =>
    import('../v1/workspaces/[wsId]/teach/courses/[courseId]/tests/route'),
  'v1/workspaces/[wsId]/teach/users/route.ts': () =>
    import('../v1/workspaces/[wsId]/teach/users/route'),
  'v1/workspaces/[wsId]/templates/[templateId]/background-url/route.ts': () =>
    import(
      '../v1/workspaces/[wsId]/templates/[templateId]/background-url/route'
    ),
  'v1/workspaces/[wsId]/templates/[templateId]/route.ts': () =>
    import('../v1/workspaces/[wsId]/templates/[templateId]/route'),
  'v1/workspaces/[wsId]/templates/[templateId]/shares/route.ts': () =>
    import('../v1/workspaces/[wsId]/templates/[templateId]/shares/route'),
  'v1/workspaces/[wsId]/templates/[templateId]/use/route.ts': () =>
    import('../v1/workspaces/[wsId]/templates/[templateId]/use/route'),
  'v1/workspaces/[wsId]/templates/background/route.ts': () =>
    import('../v1/workspaces/[wsId]/templates/background/route'),
  'v1/workspaces/[wsId]/templates/route.ts': () =>
    import('../v1/workspaces/[wsId]/templates/route'),
  'v1/workspaces/[wsId]/templates/upload-url/route.ts': () =>
    import('../v1/workspaces/[wsId]/templates/upload-url/route'),
  'v1/workspaces/[wsId]/time-tracker/stats/route.ts': () =>
    import('../v1/workspaces/[wsId]/time-tracker/stats/route'),
  'v1/workspaces/[wsId]/time-tracking/analytics/route.ts': () =>
    import('../v1/workspaces/[wsId]/time-tracking/analytics/route'),
  'v1/workspaces/[wsId]/time-tracking/break-types/[breakTypeId]/route.ts': () =>
    import(
      '../v1/workspaces/[wsId]/time-tracking/break-types/[breakTypeId]/route'
    ),
  'v1/workspaces/[wsId]/time-tracking/break-types/route.ts': () =>
    import('../v1/workspaces/[wsId]/time-tracking/break-types/route'),
  'v1/workspaces/[wsId]/time-tracking/breaks/route.ts': () =>
    import('../v1/workspaces/[wsId]/time-tracking/breaks/route'),
  'v1/workspaces/[wsId]/time-tracking/categories/[categoryId]/route.ts': () =>
    import(
      '../v1/workspaces/[wsId]/time-tracking/categories/[categoryId]/route'
    ),
  'v1/workspaces/[wsId]/time-tracking/categories/copy/route.ts': () =>
    import('../v1/workspaces/[wsId]/time-tracking/categories/copy/route'),
  'v1/workspaces/[wsId]/time-tracking/categories/route.ts': () =>
    import('../v1/workspaces/[wsId]/time-tracking/categories/route'),
  'v1/workspaces/[wsId]/time-tracking/goals/[goalId]/route.ts': () =>
    import('../v1/workspaces/[wsId]/time-tracking/goals/[goalId]/route'),
  'v1/workspaces/[wsId]/time-tracking/goals/route.ts': () =>
    import('../v1/workspaces/[wsId]/time-tracking/goals/route'),
  'v1/workspaces/[wsId]/time-tracking/quick-start/route.ts': () =>
    import('../v1/workspaces/[wsId]/time-tracking/quick-start/route'),
  'v1/workspaces/[wsId]/time-tracking/requests/[id]/activity/route.ts': () =>
    import(
      '../v1/workspaces/[wsId]/time-tracking/requests/[id]/activity/route'
    ),
  'v1/workspaces/[wsId]/time-tracking/requests/[id]/comments/[commentId]/route.ts':
    () =>
      import(
        '../v1/workspaces/[wsId]/time-tracking/requests/[id]/comments/[commentId]/route'
      ),
  'v1/workspaces/[wsId]/time-tracking/requests/[id]/comments/route.ts': () =>
    import(
      '../v1/workspaces/[wsId]/time-tracking/requests/[id]/comments/route'
    ),
  'v1/workspaces/[wsId]/time-tracking/requests/[id]/image-urls/route.ts': () =>
    import(
      '../v1/workspaces/[wsId]/time-tracking/requests/[id]/image-urls/route'
    ),
  'v1/workspaces/[wsId]/time-tracking/requests/[id]/route.ts': () =>
    import('../v1/workspaces/[wsId]/time-tracking/requests/[id]/route'),
  'v1/workspaces/[wsId]/time-tracking/requests/route.ts': () =>
    import('../v1/workspaces/[wsId]/time-tracking/requests/route'),
  'v1/workspaces/[wsId]/time-tracking/requests/upload-url/route.ts': () =>
    import('../v1/workspaces/[wsId]/time-tracking/requests/upload-url/route'),
  'v1/workspaces/[wsId]/time-tracking/requests/users/route.ts': () =>
    import('../v1/workspaces/[wsId]/time-tracking/requests/users/route'),
  'v1/workspaces/[wsId]/time-tracking/sessions/[sessionId]/breaks/active/route.ts':
    () =>
      import(
        '../v1/workspaces/[wsId]/time-tracking/sessions/[sessionId]/breaks/active/route'
      ),
  'v1/workspaces/[wsId]/time-tracking/sessions/[sessionId]/move/route.ts': () =>
    import(
      '../v1/workspaces/[wsId]/time-tracking/sessions/[sessionId]/move/route'
    ),
  'v1/workspaces/[wsId]/time-tracking/sessions/[sessionId]/route.ts': () =>
    import('../v1/workspaces/[wsId]/time-tracking/sessions/[sessionId]/route'),
  'v1/workspaces/[wsId]/time-tracking/sessions/route.ts': () =>
    import('../v1/workspaces/[wsId]/time-tracking/sessions/route'),
  'v1/workspaces/[wsId]/time-tracking/stats/period/route.ts': () =>
    import('../v1/workspaces/[wsId]/time-tracking/stats/period/route'),
  'v1/workspaces/[wsId]/time-tracking/templates/route.ts': () =>
    import('../v1/workspaces/[wsId]/time-tracking/templates/route'),
  'v1/workspaces/[wsId]/time-tracking/threshold/route.ts': () =>
    import('../v1/workspaces/[wsId]/time-tracking/threshold/route'),
  'v1/workspaces/[wsId]/topic-announcements/announcements/[announcementId]/attachments/[attachmentId]/route.ts':
    () =>
      import(
        '../v1/workspaces/[wsId]/topic-announcements/announcements/[announcementId]/attachments/[attachmentId]/route'
      ),
  'v1/workspaces/[wsId]/topic-announcements/announcements/[announcementId]/cancel-schedule/route.ts':
    () =>
      import(
        '../v1/workspaces/[wsId]/topic-announcements/announcements/[announcementId]/cancel-schedule/route'
      ),
  'v1/workspaces/[wsId]/topic-announcements/announcements/[announcementId]/route.ts':
    () =>
      import(
        '../v1/workspaces/[wsId]/topic-announcements/announcements/[announcementId]/route'
      ),
  'v1/workspaces/[wsId]/topic-announcements/announcements/[announcementId]/schedule/route.ts':
    () =>
      import(
        '../v1/workspaces/[wsId]/topic-announcements/announcements/[announcementId]/schedule/route'
      ),
  'v1/workspaces/[wsId]/topic-announcements/announcements/[announcementId]/send/route.ts':
    () =>
      import(
        '../v1/workspaces/[wsId]/topic-announcements/announcements/[announcementId]/send/route'
      ),
  'v1/workspaces/[wsId]/topic-announcements/attachments/upload/route.ts': () =>
    import(
      '../v1/workspaces/[wsId]/topic-announcements/attachments/upload/route'
    ),
  'v1/workspaces/[wsId]/topic-announcements/contacts/[contactId]/route.ts':
    () =>
      import(
        '../v1/workspaces/[wsId]/topic-announcements/contacts/[contactId]/route'
      ),
  'v1/workspaces/[wsId]/topic-announcements/contacts/[contactId]/verify/route.ts':
    () =>
      import(
        '../v1/workspaces/[wsId]/topic-announcements/contacts/[contactId]/verify/route'
      ),
  'v1/workspaces/[wsId]/topic-announcements/contacts/route.ts': () =>
    import('../v1/workspaces/[wsId]/topic-announcements/contacts/route'),
  'v1/workspaces/[wsId]/topic-announcements/import/route.ts': () =>
    import('../v1/workspaces/[wsId]/topic-announcements/import/route'),
  'v1/workspaces/[wsId]/topic-announcements/preview/route.ts': () =>
    import('../v1/workspaces/[wsId]/topic-announcements/preview/route'),
  'v1/workspaces/[wsId]/topic-announcements/route.ts': () =>
    import('../v1/workspaces/[wsId]/topic-announcements/route'),
  'v1/workspaces/[wsId]/topic-announcements/send-bulk/route.ts': () =>
    import('../v1/workspaces/[wsId]/topic-announcements/send-bulk/route'),
  'v1/workspaces/[wsId]/topic-announcements/templates/[templateId]/route.ts':
    () =>
      import(
        '../v1/workspaces/[wsId]/topic-announcements/templates/[templateId]/route'
      ),
  'v1/workspaces/[wsId]/topic-announcements/templates/route.ts': () =>
    import('../v1/workspaces/[wsId]/topic-announcements/templates/route'),
  'v1/workspaces/[wsId]/tulearn/assignments/route.ts': () =>
    import('../v1/workspaces/[wsId]/tulearn/assignments/route'),
  'v1/workspaces/[wsId]/tulearn/courses/[courseId]/modules/[moduleId]/route.ts':
    () =>
      import(
        '../v1/workspaces/[wsId]/tulearn/courses/[courseId]/modules/[moduleId]/route'
      ),
  'v1/workspaces/[wsId]/tulearn/courses/[courseId]/route.ts': () =>
    import('../v1/workspaces/[wsId]/tulearn/courses/[courseId]/route'),
  'v1/workspaces/[wsId]/tulearn/courses/[courseId]/tests/[testId]/attempt/route.ts':
    () =>
      import(
        '../v1/workspaces/[wsId]/tulearn/courses/[courseId]/tests/[testId]/attempt/route'
      ),
  'v1/workspaces/[wsId]/tulearn/courses/[courseId]/tests/[testId]/save-answer/route.ts':
    () =>
      import(
        '../v1/workspaces/[wsId]/tulearn/courses/[courseId]/tests/[testId]/save-answer/route'
      ),
  'v1/workspaces/[wsId]/tulearn/courses/[courseId]/tests/[testId]/start/route.ts':
    () =>
      import(
        '../v1/workspaces/[wsId]/tulearn/courses/[courseId]/tests/[testId]/start/route'
      ),
  'v1/workspaces/[wsId]/tulearn/courses/[courseId]/tests/[testId]/submit/route.ts':
    () =>
      import(
        '../v1/workspaces/[wsId]/tulearn/courses/[courseId]/tests/[testId]/submit/route'
      ),
  'v1/workspaces/[wsId]/tulearn/courses/route.ts': () =>
    import('../v1/workspaces/[wsId]/tulearn/courses/route'),
  'v1/workspaces/[wsId]/tulearn/home/route.ts': () =>
    import('../v1/workspaces/[wsId]/tulearn/home/route'),
  'v1/workspaces/[wsId]/tulearn/marks/route.ts': () =>
    import('../v1/workspaces/[wsId]/tulearn/marks/route'),
  'v1/workspaces/[wsId]/tulearn/parent-links/[linkId]/route.ts': () =>
    import('../v1/workspaces/[wsId]/tulearn/parent-links/[linkId]/route'),
  'v1/workspaces/[wsId]/tulearn/parent-links/route.ts': () =>
    import('../v1/workspaces/[wsId]/tulearn/parent-links/route'),
  'v1/workspaces/[wsId]/tulearn/practice/route.ts': () =>
    import('../v1/workspaces/[wsId]/tulearn/practice/route'),
  'v1/workspaces/[wsId]/tulearn/reports/route.ts': () =>
    import('../v1/workspaces/[wsId]/tulearn/reports/route'),
  'v1/workspaces/[wsId]/tutoring/export/route.ts': () =>
    import('../v1/workspaces/[wsId]/tutoring/export/route'),
  'v1/workspaces/[wsId]/tutoring/queue/route.ts': () =>
    import('../v1/workspaces/[wsId]/tutoring/queue/route'),
  'v1/workspaces/[wsId]/tutoring/sessions/[id]/mark/route.ts': () =>
    import('../v1/workspaces/[wsId]/tutoring/sessions/[id]/mark/route'),
  'v1/workspaces/[wsId]/tutoring/sessions/[id]/message-preview/route.ts': () =>
    import(
      '../v1/workspaces/[wsId]/tutoring/sessions/[id]/message-preview/route'
    ),
  'v1/workspaces/[wsId]/tutoring/sessions/[id]/route.ts': () =>
    import('../v1/workspaces/[wsId]/tutoring/sessions/[id]/route'),
  'v1/workspaces/[wsId]/tutoring/sessions/route.ts': () =>
    import('../v1/workspaces/[wsId]/tutoring/sessions/route'),
  'v1/workspaces/[wsId]/user-groups/[groupId]/attendance/route.ts': () =>
    import('../v1/workspaces/[wsId]/user-groups/[groupId]/attendance/route'),
  'v1/workspaces/[wsId]/user-groups/[groupId]/count/route.ts': () =>
    import('../v1/workspaces/[wsId]/user-groups/[groupId]/count/route'),
  'v1/workspaces/[wsId]/user-groups/[groupId]/group-checks/[postId]/email/route.ts':
    () =>
      import(
        '../v1/workspaces/[wsId]/user-groups/[groupId]/group-checks/[postId]/email/route'
      ),
  'v1/workspaces/[wsId]/user-groups/[groupId]/group-checks/[postId]/route.ts':
    () =>
      import(
        '../v1/workspaces/[wsId]/user-groups/[groupId]/group-checks/[postId]/route'
      ),
  'v1/workspaces/[wsId]/user-groups/[groupId]/group-checks/route.ts': () =>
    import('../v1/workspaces/[wsId]/user-groups/[groupId]/group-checks/route'),
  'v1/workspaces/[wsId]/user-groups/[groupId]/indicators/[indicatorId]/route.ts':
    () =>
      import(
        '../v1/workspaces/[wsId]/user-groups/[groupId]/indicators/[indicatorId]/route'
      ),
  'v1/workspaces/[wsId]/user-groups/[groupId]/indicators/categories/[categoryId]/route.ts':
    () =>
      import(
        '../v1/workspaces/[wsId]/user-groups/[groupId]/indicators/categories/[categoryId]/route'
      ),
  'v1/workspaces/[wsId]/user-groups/[groupId]/indicators/categories/route.ts':
    () =>
      import(
        '../v1/workspaces/[wsId]/user-groups/[groupId]/indicators/categories/route'
      ),
  'v1/workspaces/[wsId]/user-groups/[groupId]/indicators/route.ts': () =>
    import('../v1/workspaces/[wsId]/user-groups/[groupId]/indicators/route'),
  'v1/workspaces/[wsId]/user-groups/[groupId]/linked-products/[productId]/route.ts':
    () =>
      import(
        '../v1/workspaces/[wsId]/user-groups/[groupId]/linked-products/[productId]/route'
      ),
  'v1/workspaces/[wsId]/user-groups/[groupId]/linked-products/route.ts': () =>
    import(
      '../v1/workspaces/[wsId]/user-groups/[groupId]/linked-products/route'
    ),
  'v1/workspaces/[wsId]/user-groups/[groupId]/managers/route.ts': () =>
    import('../v1/workspaces/[wsId]/user-groups/[groupId]/managers/route'),
  'v1/workspaces/[wsId]/user-groups/[groupId]/members/[userId]/feedbacks/route.ts':
    () =>
      import(
        '../v1/workspaces/[wsId]/user-groups/[groupId]/members/[userId]/feedbacks/route'
      ),
  'v1/workspaces/[wsId]/user-groups/[groupId]/members/[userId]/route.ts': () =>
    import(
      '../v1/workspaces/[wsId]/user-groups/[groupId]/members/[userId]/route'
    ),
  'v1/workspaces/[wsId]/user-groups/[groupId]/members/[userId]/vitals/route.ts':
    () =>
      import(
        '../v1/workspaces/[wsId]/user-groups/[groupId]/members/[userId]/vitals/route'
      ),
  'v1/workspaces/[wsId]/user-groups/[groupId]/members/route.ts': () =>
    import('../v1/workspaces/[wsId]/user-groups/[groupId]/members/route'),
  'v1/workspaces/[wsId]/user-groups/[groupId]/module-groups/[moduleGroupId]/module-order/route.ts':
    () =>
      import(
        '../v1/workspaces/[wsId]/user-groups/[groupId]/module-groups/[moduleGroupId]/module-order/route'
      ),
  'v1/workspaces/[wsId]/user-groups/[groupId]/module-groups/[moduleGroupId]/modules/route.ts':
    () =>
      import(
        '../v1/workspaces/[wsId]/user-groups/[groupId]/module-groups/[moduleGroupId]/modules/route'
      ),
  'v1/workspaces/[wsId]/user-groups/[groupId]/module-groups/[moduleGroupId]/route.ts':
    () =>
      import(
        '../v1/workspaces/[wsId]/user-groups/[groupId]/module-groups/[moduleGroupId]/route'
      ),
  'v1/workspaces/[wsId]/user-groups/[groupId]/module-groups/order/route.ts':
    () =>
      import(
        '../v1/workspaces/[wsId]/user-groups/[groupId]/module-groups/order/route'
      ),
  'v1/workspaces/[wsId]/user-groups/[groupId]/module-groups/route.ts': () =>
    import('../v1/workspaces/[wsId]/user-groups/[groupId]/module-groups/route'),
  'v1/workspaces/[wsId]/user-groups/[groupId]/module-order/route.ts': () =>
    import('../v1/workspaces/[wsId]/user-groups/[groupId]/module-order/route'),
  'v1/workspaces/[wsId]/user-groups/[groupId]/modules/route.ts': () =>
    import('../v1/workspaces/[wsId]/user-groups/[groupId]/modules/route'),
  'v1/workspaces/[wsId]/user-groups/[groupId]/posts/[postId]/route.ts': () =>
    import(
      '../v1/workspaces/[wsId]/user-groups/[groupId]/posts/[postId]/route'
    ),
  'v1/workspaces/[wsId]/user-groups/[groupId]/posts/[postId]/status/route.ts':
    () =>
      import(
        '../v1/workspaces/[wsId]/user-groups/[groupId]/posts/[postId]/status/route'
      ),
  'v1/workspaces/[wsId]/user-groups/[groupId]/posts/route.ts': () =>
    import('../v1/workspaces/[wsId]/user-groups/[groupId]/posts/route'),
  'v1/workspaces/[wsId]/user-groups/[groupId]/route.ts': () =>
    import('../v1/workspaces/[wsId]/user-groups/[groupId]/route'),
  'v1/workspaces/[wsId]/user-groups/[groupId]/storage/route.ts': () =>
    import('../v1/workspaces/[wsId]/user-groups/[groupId]/storage/route'),
  'v1/workspaces/[wsId]/user-groups/activity-logs/route.ts': () =>
    import('../v1/workspaces/[wsId]/user-groups/activity-logs/route'),
  'v1/workspaces/[wsId]/user-groups/count/route.ts': () =>
    import('../v1/workspaces/[wsId]/user-groups/count/route'),
  'v1/workspaces/[wsId]/user-groups/linked-products/route.ts': () =>
    import('../v1/workspaces/[wsId]/user-groups/linked-products/route'),
  'v1/workspaces/[wsId]/user-groups/route.ts': () =>
    import('../v1/workspaces/[wsId]/user-groups/route'),
  'v1/workspaces/[wsId]/user-groups/sessions/[sessionId]/reconcile/route.ts':
    () =>
      import(
        '../v1/workspaces/[wsId]/user-groups/sessions/[sessionId]/reconcile/route'
      ),
  'v1/workspaces/[wsId]/user-groups/sessions/[sessionId]/route.ts': () =>
    import('../v1/workspaces/[wsId]/user-groups/sessions/[sessionId]/route'),
  'v1/workspaces/[wsId]/user-groups/sessions/group-summaries/route.ts': () =>
    import(
      '../v1/workspaces/[wsId]/user-groups/sessions/group-summaries/route'
    ),
  'v1/workspaces/[wsId]/user-groups/sessions/occurrences/route.ts': () =>
    import('../v1/workspaces/[wsId]/user-groups/sessions/occurrences/route'),
  'v1/workspaces/[wsId]/user-groups/sessions/route.ts': () =>
    import('../v1/workspaces/[wsId]/user-groups/sessions/route'),
  'v1/workspaces/[wsId]/user-profile-links/[linkId]/route.ts': () =>
    import('../v1/workspaces/[wsId]/user-profile-links/[linkId]/route'),
  'v1/workspaces/[wsId]/user-profile-links/route.ts': () =>
    import('../v1/workspaces/[wsId]/user-profile-links/route'),
  'v1/workspaces/[wsId]/user-profile-links/users/route.ts': () =>
    import('../v1/workspaces/[wsId]/user-profile-links/users/route'),
  'v1/workspaces/[wsId]/users/[userId]/attendance/route.ts': () =>
    import('../v1/workspaces/[wsId]/users/[userId]/attendance/route'),
  'v1/workspaces/[wsId]/users/[userId]/emails/route.ts': () =>
    import('../v1/workspaces/[wsId]/users/[userId]/emails/route'),
  'v1/workspaces/[wsId]/users/[userId]/follow-up/route.ts': () =>
    import('../v1/workspaces/[wsId]/users/[userId]/follow-up/route'),
  'v1/workspaces/[wsId]/users/[userId]/linked-promotions/route.ts': () =>
    import('../v1/workspaces/[wsId]/users/[userId]/linked-promotions/route'),
  'v1/workspaces/[wsId]/users/[userId]/referral-discounts/route.ts': () =>
    import('../v1/workspaces/[wsId]/users/[userId]/referral-discounts/route'),
  'v1/workspaces/[wsId]/users/[userId]/referrals/route.ts': () =>
    import('../v1/workspaces/[wsId]/users/[userId]/referrals/route'),
  'v1/workspaces/[wsId]/users/[userId]/route.ts': () =>
    import('../v1/workspaces/[wsId]/users/[userId]/route'),
  'v1/workspaces/[wsId]/users/[userId]/user-groups/route.ts': () =>
    import('../v1/workspaces/[wsId]/users/[userId]/user-groups/route'),
  'v1/workspaces/[wsId]/users/approvals/logs/route.ts': () =>
    import('../v1/workspaces/[wsId]/users/approvals/logs/route'),
  'v1/workspaces/[wsId]/users/approvals/route.ts': () =>
    import('../v1/workspaces/[wsId]/users/approvals/route'),
  'v1/workspaces/[wsId]/users/attendance/export/route.ts': () =>
    import('../v1/workspaces/[wsId]/users/attendance/export/route'),
  'v1/workspaces/[wsId]/users/audit-logs/backfill/route.ts': () =>
    import('../v1/workspaces/[wsId]/users/audit-logs/backfill/route'),
  'v1/workspaces/[wsId]/users/audit-logs/route.ts': () =>
    import('../v1/workspaces/[wsId]/users/audit-logs/route'),
  'v1/workspaces/[wsId]/users/avatar/route.ts': () =>
    import('../v1/workspaces/[wsId]/users/avatar/route'),
  'v1/workspaces/[wsId]/users/bulk-import/route.ts': () =>
    import('../v1/workspaces/[wsId]/users/bulk-import/route'),
  'v1/workspaces/[wsId]/users/count/route.ts': () =>
    import('../v1/workspaces/[wsId]/users/count/route'),
  'v1/workspaces/[wsId]/users/database/route.ts': () =>
    import('../v1/workspaces/[wsId]/users/database/route'),
  'v1/workspaces/[wsId]/users/duplicates/detect/route.ts': () =>
    import('../v1/workspaces/[wsId]/users/duplicates/detect/route'),
  'v1/workspaces/[wsId]/users/feedbacks/route.ts': () =>
    import('../v1/workspaces/[wsId]/users/feedbacks/route'),
  'v1/workspaces/[wsId]/users/fields/[fieldId]/route.ts': () =>
    import('../v1/workspaces/[wsId]/users/fields/[fieldId]/route'),
  'v1/workspaces/[wsId]/users/fields/route.ts': () =>
    import('../v1/workspaces/[wsId]/users/fields/route'),
  'v1/workspaces/[wsId]/users/groups/featured-counts/route.ts': () =>
    import('../v1/workspaces/[wsId]/users/groups/featured-counts/route'),
  'v1/workspaces/[wsId]/users/groups/possible-excluded/route.ts': () =>
    import('../v1/workspaces/[wsId]/users/groups/possible-excluded/route'),
  'v1/workspaces/[wsId]/users/groups/route.ts': () =>
    import('../v1/workspaces/[wsId]/users/groups/route'),
  'v1/workspaces/[wsId]/users/links/repair/route.ts': () =>
    import('../v1/workspaces/[wsId]/users/links/repair/route'),
  'v1/workspaces/[wsId]/users/me/route.ts': () =>
    import('../v1/workspaces/[wsId]/users/me/route'),
  'v1/workspaces/[wsId]/users/merge/bulk/route.ts': () =>
    import('../v1/workspaces/[wsId]/users/merge/bulk/route'),
  'v1/workspaces/[wsId]/users/merge/route.ts': () =>
    import('../v1/workspaces/[wsId]/users/merge/route'),
  'v1/workspaces/[wsId]/users/reports/[reportId]/logs/route.ts': () =>
    import('../v1/workspaces/[wsId]/users/reports/[reportId]/logs/route'),
  'v1/workspaces/[wsId]/users/reports/[reportId]/route.ts': () =>
    import('../v1/workspaces/[wsId]/users/reports/[reportId]/route'),
  'v1/workspaces/[wsId]/users/reports/groups/[groupId]/bulk-export/route.ts':
    () =>
      import(
        '../v1/workspaces/[wsId]/users/reports/groups/[groupId]/bulk-export/route'
      ),
  'v1/workspaces/[wsId]/users/reports/groups/[groupId]/dashboard/route.ts':
    () =>
      import(
        '../v1/workspaces/[wsId]/users/reports/groups/[groupId]/dashboard/route'
      ),
  'v1/workspaces/[wsId]/users/reports/groups/route.ts': () =>
    import('../v1/workspaces/[wsId]/users/reports/groups/route'),
  'v1/workspaces/[wsId]/users/reports/route.ts': () =>
    import('../v1/workspaces/[wsId]/users/reports/route'),
  'v1/workspaces/[wsId]/users/route.ts': () =>
    import('../v1/workspaces/[wsId]/users/route'),
  'v1/workspaces/[wsId]/wallets/[walletId]/roles/[roleId]/route.ts': () =>
    import('../v1/workspaces/[wsId]/wallets/[walletId]/roles/[roleId]/route'),
  'v1/workspaces/[wsId]/wallets/[walletId]/roles/route.ts': () =>
    import('../v1/workspaces/[wsId]/wallets/[walletId]/roles/route'),
  'v1/workspaces/[wsId]/wallets/infinite/route.ts': () =>
    import('../v1/workspaces/[wsId]/wallets/infinite/route'),
  'v1/workspaces/[wsId]/wallets/route.ts': () =>
    import('../v1/workspaces/[wsId]/wallets/route'),
  'v1/workspaces/[wsId]/whiteboards/[boardId]/image-url/route.ts': () =>
    import('../v1/workspaces/[wsId]/whiteboards/[boardId]/image-url/route'),
  'v1/workspaces/[wsId]/whiteboards/[boardId]/route.ts': () =>
    import('../v1/workspaces/[wsId]/whiteboards/[boardId]/route'),
  'v1/workspaces/[wsId]/whiteboards/route.ts': () =>
    import('../v1/workspaces/[wsId]/whiteboards/route'),
  'v1/workspaces/[wsId]/workforce/users/[userId]/route.ts': () =>
    import('../v1/workspaces/[wsId]/workforce/users/[userId]/route'),
  'v1/workspaces/[wsId]/workforce/users/route.ts': () =>
    import('../v1/workspaces/[wsId]/workforce/users/route'),
  'v1/workspaces/limits/route.ts': () =>
    import('../v1/workspaces/limits/route'),
  'v1/workspaces/personal/route.ts': () =>
    import('../v1/workspaces/personal/route'),
  'v1/workspaces/route.ts': () => import('../v1/workspaces/route'),
  'v1/workspaces/team/route.ts': () => import('../v1/workspaces/team/route'),
} satisfies LegacyApiRouteLoaderMap;
