export const fixtures = [
  {
    pattern: '/api/ai/email-draft',
    methods: ['POST'],
    params: [],
    zeroMethods: [],
  },
  {
    pattern: '/api/auth/logout',
    methods: ['GET', 'POST'],
    params: [],
    zeroMethods: ['GET', 'POST'],
  },
  {
    pattern: '/api/auth/refresh-app-session',
    methods: ['POST'],
    params: [],
    zeroMethods: [],
  },
  {
    pattern: '/api/auth/verify-app-token',
    methods: ['POST'],
    params: [],
    zeroMethods: [],
  },
  {
    pattern: '/api/build-info',
    methods: ['GET'],
    params: [],
    zeroMethods: ['GET'],
  },
  {
    pattern: '/api/v1/mail/connected/callback',
    methods: ['GET'],
    params: [],
    zeroMethods: [],
  },
  {
    pattern: '/api/v1/mail/domains/[domainId]/catch-all',
    methods: ['GET', 'PATCH'],
    params: ['domainId'],
    zeroMethods: [],
  },
  {
    pattern: '/api/v1/mail/domains',
    methods: ['GET', 'PUT'],
    params: [],
    zeroMethods: ['GET'],
  },
  {
    pattern: '/api/v1/webhooks/mail/cloudflare',
    methods: ['POST'],
    params: [],
    zeroMethods: [],
  },
  {
    pattern: '/api/v1/webhooks/mail/ses',
    methods: ['POST'],
    params: [],
    zeroMethods: [],
  },
  {
    pattern: '/api/v1/workspaces/[wsId]/mail/bootstrap',
    methods: ['GET'],
    params: ['wsId'],
    zeroMethods: [],
  },
  {
    pattern: '/api/v1/workspaces/[wsId]/mail/connected/[[...segments]]',
    methods: ['GET', 'POST', 'DELETE'],
    params: ['wsId', 'segments'],
    zeroMethods: [],
  },
  {
    pattern: '/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/ai/draft',
    methods: ['POST'],
    params: ['wsId', 'mailboxId'],
    zeroMethods: [],
  },
  {
    pattern: '/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/ai/labels',
    methods: ['POST'],
    params: ['wsId', 'mailboxId'],
    zeroMethods: [],
  },
  {
    pattern:
      '/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/drafts/[draftId]/attachments/[attachmentId]',
    methods: ['GET', 'DELETE'],
    params: ['wsId', 'mailboxId', 'draftId', 'attachmentId'],
    zeroMethods: [],
  },
  {
    pattern:
      '/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/drafts/[draftId]/attachments',
    methods: ['POST'],
    params: ['wsId', 'mailboxId', 'draftId'],
    zeroMethods: [],
  },
  {
    pattern:
      '/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/drafts/[draftId]',
    methods: ['PATCH', 'DELETE'],
    params: ['wsId', 'mailboxId', 'draftId'],
    zeroMethods: [],
  },
  {
    pattern: '/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/drafts',
    methods: ['POST'],
    params: ['wsId', 'mailboxId'],
    zeroMethods: [],
  },
  {
    pattern:
      '/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/folders/[folderId]',
    methods: ['PATCH', 'DELETE'],
    params: ['wsId', 'mailboxId', 'folderId'],
    zeroMethods: [],
  },
  {
    pattern: '/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/folders',
    methods: ['POST'],
    params: ['wsId', 'mailboxId'],
    zeroMethods: [],
  },
  {
    pattern:
      '/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/labels/[labelId]',
    methods: ['PATCH', 'DELETE'],
    params: ['wsId', 'mailboxId', 'labelId'],
    zeroMethods: [],
  },
  {
    pattern: '/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/labels',
    methods: ['POST'],
    params: ['wsId', 'mailboxId'],
    zeroMethods: [],
  },
  {
    pattern:
      '/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/members/[userId]',
    methods: ['DELETE'],
    params: ['wsId', 'mailboxId', 'userId'],
    zeroMethods: [],
  },
  {
    pattern: '/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/members',
    methods: ['GET', 'POST'],
    params: ['wsId', 'mailboxId'],
    zeroMethods: [],
  },
  {
    pattern:
      '/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/messages/[messageId]/attachments/[attachmentId]',
    methods: ['GET'],
    params: ['wsId', 'mailboxId', 'messageId', 'attachmentId'],
    zeroMethods: [],
  },
  {
    pattern:
      '/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/messages/[messageId]/blacklist',
    methods: ['GET', 'POST'],
    params: ['wsId', 'mailboxId', 'messageId'],
    zeroMethods: [],
  },
  {
    pattern:
      '/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/messages/[messageId]/calendar-link/preview',
    methods: ['POST'],
    params: ['wsId', 'mailboxId', 'messageId'],
    zeroMethods: [],
  },
  {
    pattern:
      '/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/messages/[messageId]/calendar-link',
    methods: ['GET', 'PUT', 'DELETE'],
    params: ['wsId', 'mailboxId', 'messageId'],
    zeroMethods: [],
  },
  {
    pattern:
      '/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/messages/[messageId]/invitation',
    methods: ['GET', 'POST'],
    params: ['wsId', 'mailboxId', 'messageId'],
    zeroMethods: [],
  },
  {
    pattern:
      '/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/messages/[messageId]',
    methods: ['GET'],
    params: ['wsId', 'mailboxId', 'messageId'],
    zeroMethods: [],
  },
  {
    pattern:
      '/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/messages/[messageId]/state',
    methods: ['PATCH'],
    params: ['wsId', 'mailboxId', 'messageId'],
    zeroMethods: [],
  },
  {
    pattern:
      '/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/messages/bulk',
    methods: ['PATCH'],
    params: ['wsId', 'mailboxId'],
    zeroMethods: [],
  },
  {
    pattern: '/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/messages',
    methods: ['GET', 'POST'],
    params: ['wsId', 'mailboxId'],
    zeroMethods: [],
  },
  {
    pattern:
      '/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/organization',
    methods: ['GET'],
    params: ['wsId', 'mailboxId'],
    zeroMethods: [],
  },
  {
    pattern: '/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/read-all',
    methods: ['POST'],
    params: ['wsId', 'mailboxId'],
    zeroMethods: [],
  },
  {
    pattern: '/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/settings',
    methods: ['GET', 'PATCH'],
    params: ['wsId', 'mailboxId'],
    zeroMethods: [],
  },
  {
    pattern:
      '/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/threads/[threadId]',
    methods: ['GET', 'PATCH'],
    params: ['wsId', 'mailboxId', 'threadId'],
    zeroMethods: [],
  },
  {
    pattern:
      '/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/threads/bulk',
    methods: ['POST'],
    params: ['wsId', 'mailboxId'],
    zeroMethods: [],
  },
  {
    pattern: '/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/threads',
    methods: ['GET'],
    params: ['wsId', 'mailboxId'],
    zeroMethods: [],
  },
  {
    pattern: '/api/v1/workspaces/[wsId]/mail',
    methods: ['GET'],
    params: ['wsId'],
    zeroMethods: [],
  },
  {
    pattern: '/api/v1/workspaces/[wsId]/mail/send',
    methods: ['POST'],
    params: ['wsId'],
    zeroMethods: [],
  },
];
