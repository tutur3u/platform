import { NextRequest } from 'next/dist/server/web/spec-extension/request';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, ReturnType<typeof vi.fn>>();
  return {
    handlers,
    module(methods: Record<string, unknown>) {
      return {
        GET: undefined,
        HEAD: undefined,
        POST: undefined,
        PUT: undefined,
        PATCH: undefined,
        DELETE: undefined,
        OPTIONS: undefined,
        ...methods,
      };
    },
    make(key: string) {
      const handler = vi.fn(async (..._args: unknown[]) =>
        Response.json({ key })
      );
      handlers.set(key, handler);
      return handler;
    },
  };
});
vi.mock('@tanstack/react-start/server-only', () => mocks.module({}));
vi.mock('../app/api/ai/email-draft/route', () =>
  mocks.module({
    POST: mocks.make('/api/ai/email-draft POST'),
  })
);
vi.mock('../app/api/auth/logout/route', () =>
  mocks.module({
    GET: mocks.make('/api/auth/logout GET'),
    POST: mocks.make('/api/auth/logout POST'),
  })
);
vi.mock('../app/api/auth/refresh-app-session/route', () =>
  mocks.module({
    POST: mocks.make('/api/auth/refresh-app-session POST'),
  })
);
vi.mock('../app/api/auth/verify-app-token/route', () =>
  mocks.module({
    POST: mocks.make('/api/auth/verify-app-token POST'),
  })
);
vi.mock('../app/api/build-info/route', () =>
  mocks.module({
    GET: mocks.make('/api/build-info GET'),
  })
);
vi.mock('../app/api/v1/mail/connected/callback/route', () =>
  mocks.module({
    GET: mocks.make('/api/v1/mail/connected/callback GET'),
  })
);
vi.mock('../app/api/v1/mail/domains/[domainId]/catch-all/route', () =>
  mocks.module({
    GET: mocks.make('/api/v1/mail/domains/[domainId]/catch-all GET'),
    PATCH: mocks.make('/api/v1/mail/domains/[domainId]/catch-all PATCH'),
  })
);
vi.mock('../app/api/v1/mail/domains/route', () =>
  mocks.module({
    GET: mocks.make('/api/v1/mail/domains GET'),
    PUT: mocks.make('/api/v1/mail/domains PUT'),
  })
);
vi.mock('../app/api/v1/webhooks/mail/cloudflare/route', () =>
  mocks.module({
    POST: mocks.make('/api/v1/webhooks/mail/cloudflare POST'),
  })
);
vi.mock('../app/api/v1/webhooks/mail/ses/route', () =>
  mocks.module({
    POST: mocks.make('/api/v1/webhooks/mail/ses POST'),
  })
);
vi.mock('../app/api/v1/workspaces/[wsId]/mail/bootstrap/route', () =>
  mocks.module({
    GET: mocks.make('/api/v1/workspaces/[wsId]/mail/bootstrap GET'),
  })
);
vi.mock(
  '../app/api/v1/workspaces/[wsId]/mail/connected/[[...segments]]/route',
  () =>
    mocks.module({
      GET: mocks.make(
        '/api/v1/workspaces/[wsId]/mail/connected/[[...segments]] GET'
      ),
      POST: mocks.make(
        '/api/v1/workspaces/[wsId]/mail/connected/[[...segments]] POST'
      ),
      DELETE: mocks.make(
        '/api/v1/workspaces/[wsId]/mail/connected/[[...segments]] DELETE'
      ),
    })
);
vi.mock(
  '../app/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/ai/draft/route',
  () =>
    mocks.module({
      POST: mocks.make(
        '/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/ai/draft POST'
      ),
    })
);
vi.mock(
  '../app/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/ai/labels/route',
  () =>
    mocks.module({
      POST: mocks.make(
        '/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/ai/labels POST'
      ),
    })
);
vi.mock(
  '../app/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/drafts/[draftId]/attachments/[attachmentId]/route',
  () =>
    mocks.module({
      GET: mocks.make(
        '/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/drafts/[draftId]/attachments/[attachmentId] GET'
      ),
      DELETE: mocks.make(
        '/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/drafts/[draftId]/attachments/[attachmentId] DELETE'
      ),
    })
);
vi.mock(
  '../app/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/drafts/[draftId]/attachments/route',
  () =>
    mocks.module({
      POST: mocks.make(
        '/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/drafts/[draftId]/attachments POST'
      ),
    })
);
vi.mock(
  '../app/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/drafts/[draftId]/route',
  () =>
    mocks.module({
      PATCH: mocks.make(
        '/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/drafts/[draftId] PATCH'
      ),
      DELETE: mocks.make(
        '/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/drafts/[draftId] DELETE'
      ),
    })
);
vi.mock(
  '../app/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/drafts/route',
  () =>
    mocks.module({
      POST: mocks.make(
        '/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/drafts POST'
      ),
    })
);
vi.mock(
  '../app/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/folders/[folderId]/route',
  () =>
    mocks.module({
      PATCH: mocks.make(
        '/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/folders/[folderId] PATCH'
      ),
      DELETE: mocks.make(
        '/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/folders/[folderId] DELETE'
      ),
    })
);
vi.mock(
  '../app/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/folders/route',
  () =>
    mocks.module({
      POST: mocks.make(
        '/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/folders POST'
      ),
    })
);
vi.mock(
  '../app/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/labels/[labelId]/route',
  () =>
    mocks.module({
      PATCH: mocks.make(
        '/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/labels/[labelId] PATCH'
      ),
      DELETE: mocks.make(
        '/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/labels/[labelId] DELETE'
      ),
    })
);
vi.mock(
  '../app/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/labels/route',
  () =>
    mocks.module({
      POST: mocks.make(
        '/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/labels POST'
      ),
    })
);
vi.mock(
  '../app/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/members/[userId]/route',
  () =>
    mocks.module({
      DELETE: mocks.make(
        '/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/members/[userId] DELETE'
      ),
    })
);
vi.mock(
  '../app/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/members/route',
  () =>
    mocks.module({
      GET: mocks.make(
        '/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/members GET'
      ),
      POST: mocks.make(
        '/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/members POST'
      ),
    })
);
vi.mock(
  '../app/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/messages/[messageId]/attachments/[attachmentId]/route',
  () =>
    mocks.module({
      GET: mocks.make(
        '/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/messages/[messageId]/attachments/[attachmentId] GET'
      ),
    })
);
vi.mock(
  '../app/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/messages/[messageId]/blacklist/route',
  () =>
    mocks.module({
      GET: mocks.make(
        '/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/messages/[messageId]/blacklist GET'
      ),
      POST: mocks.make(
        '/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/messages/[messageId]/blacklist POST'
      ),
    })
);
vi.mock(
  '../app/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/messages/[messageId]/calendar-link/preview/route',
  () =>
    mocks.module({
      POST: mocks.make(
        '/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/messages/[messageId]/calendar-link/preview POST'
      ),
    })
);
vi.mock(
  '../app/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/messages/[messageId]/calendar-link/route',
  () =>
    mocks.module({
      GET: mocks.make(
        '/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/messages/[messageId]/calendar-link GET'
      ),
      PUT: mocks.make(
        '/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/messages/[messageId]/calendar-link PUT'
      ),
      DELETE: mocks.make(
        '/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/messages/[messageId]/calendar-link DELETE'
      ),
    })
);
vi.mock(
  '../app/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/messages/[messageId]/invitation/route',
  () =>
    mocks.module({
      GET: mocks.make(
        '/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/messages/[messageId]/invitation GET'
      ),
      POST: mocks.make(
        '/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/messages/[messageId]/invitation POST'
      ),
    })
);
vi.mock(
  '../app/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/messages/[messageId]/route',
  () =>
    mocks.module({
      GET: mocks.make(
        '/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/messages/[messageId] GET'
      ),
    })
);
vi.mock(
  '../app/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/messages/[messageId]/state/route',
  () =>
    mocks.module({
      PATCH: mocks.make(
        '/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/messages/[messageId]/state PATCH'
      ),
    })
);
vi.mock(
  '../app/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/messages/bulk/route',
  () =>
    mocks.module({
      PATCH: mocks.make(
        '/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/messages/bulk PATCH'
      ),
    })
);
vi.mock(
  '../app/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/messages/route',
  () =>
    mocks.module({
      GET: mocks.make(
        '/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/messages GET'
      ),
      POST: mocks.make(
        '/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/messages POST'
      ),
    })
);
vi.mock(
  '../app/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/organization/route',
  () =>
    mocks.module({
      GET: mocks.make(
        '/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/organization GET'
      ),
    })
);
vi.mock(
  '../app/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/read-all/route',
  () =>
    mocks.module({
      POST: mocks.make(
        '/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/read-all POST'
      ),
    })
);
vi.mock(
  '../app/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/settings/route',
  () =>
    mocks.module({
      GET: mocks.make(
        '/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/settings GET'
      ),
      PATCH: mocks.make(
        '/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/settings PATCH'
      ),
    })
);
vi.mock(
  '../app/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/threads/[threadId]/route',
  () =>
    mocks.module({
      GET: mocks.make(
        '/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/threads/[threadId] GET'
      ),
      PATCH: mocks.make(
        '/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/threads/[threadId] PATCH'
      ),
    })
);
vi.mock(
  '../app/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/threads/bulk/route',
  () =>
    mocks.module({
      POST: mocks.make(
        '/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/threads/bulk POST'
      ),
    })
);
vi.mock(
  '../app/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/threads/route',
  () =>
    mocks.module({
      GET: mocks.make(
        '/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/threads GET'
      ),
    })
);
vi.mock('../app/api/v1/workspaces/[wsId]/mail/route', () =>
  mocks.module({
    GET: mocks.make('/api/v1/workspaces/[wsId]/mail GET'),
  })
);
vi.mock('../app/api/v1/workspaces/[wsId]/mail/send/route', () =>
  mocks.module({
    POST: mocks.make('/api/v1/workspaces/[wsId]/mail/send POST'),
  })
);

import { dispatchMailEndpoint, mailEndpoints } from './api-registry.server';

beforeEach(() => {
  for (const handler of mocks.handlers.values()) handler.mockClear();
});

import { fixtures } from './api-registry-fixtures';

describe('every original Mail API registration', () => {
  it('keeps the original 41 filesystem endpoints distinct from method helpers', () => {
    expect(mailEndpoints).toHaveLength(41);
    expect(
      new Set(mailEndpoints.map((endpoint) => endpoint.pattern)).size
    ).toBe(41);
  });
  for (const fixture of fixtures)
    for (const method of fixture.methods)
      it(`${method} ${fixture.pattern}`, async () => {
        const params: Record<string, string | string[]> = {};
        let path = fixture.pattern;
        for (const name of fixture.params) {
          if (path.includes(`[[...${name}]]`)) {
            params[name] = ['accounts', 'account'];
            path = path.replace(`[[...${name}]]`, 'accounts/account');
          } else {
            params[name] = `${name}-original`;
            path = path.replace(`[${name}]`, `${name}-original`);
          }
        }
        const request = new NextRequest(
          `https://mail.tuturuuu.com${path}?cursor=original`,
          { method, headers: { cookie: 'app=original' } }
        );
        const response = await dispatchMailEndpoint(request);
        const key = `${fixture.pattern} ${method}`;
        expect(await response?.json()).toEqual({ key });
        const handler = mocks.handlers.get(key);
        if (!handler) throw new Error('Missing canonical handler');
        expect(handler).toHaveBeenCalledTimes(1);
        const args = handler.mock.calls[0];
        if (!args) throw new Error('Missing handler call');
        expect(args[0]).toBe(request);
        {
          const context = args[1];
          if (
            typeof context !== 'object' ||
            context === null ||
            !('params' in context)
          )
            throw new Error('Missing native context');
          expect(await context.params).toEqual(params);
        }
      });
});
