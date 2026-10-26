import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createInternalApiClient,
  withContactsApiBaseUrl,
  withEducationBootstrapBaseUrl,
  withFinanceApiBaseUrl,
  withLearnApiBaseUrl,
  withMailApiBaseUrl,
  withPayApiBaseUrl,
  withTaskApiBaseUrl,
  withTeachApiBaseUrl,
} from './client';
import { listMailMessages } from './mail';
import { getMeetPlanSnapshot } from './meet';

function createFetchMock() {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({}),
  });
}

function appPathFor(app: string) {
  const base = `/${app}`;

  return (path: string) => {
    if (
      !path.startsWith('/') ||
      path.startsWith('//') ||
      path === base ||
      path.startsWith(`${base}/`)
    ) {
      return path;
    }

    return `${base}${path}`;
  };
}

describe('app base URL resolution', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('keeps every app API helper at its configured root in default mode', async () => {
    vi.stubEnv('npm_package_name', '');
    vi.stubEnv('TASKS_APP_URL', 'https://tasks.example.com');
    vi.stubEnv('MAIL_APP_URL', 'https://mail.example.com');
    vi.stubEnv('LEARN_APP_URL', 'https://learn.example.com');
    vi.stubEnv('TEACH_APP_URL', 'https://teach.example.com');
    vi.stubEnv('PAY_APP_URL', 'https://pay.example.com');
    vi.stubEnv('CONTACTS_APP_URL', 'https://contacts.example.com');
    vi.stubEnv('FINANCE_APP_URL', 'https://finance.example.com');

    const helpers = [
      ['tasks', withTaskApiBaseUrl],
      ['mail', withMailApiBaseUrl],
      ['learn', withLearnApiBaseUrl],
      ['teach', withTeachApiBaseUrl],
      ['pay', withPayApiBaseUrl],
      ['contacts', withContactsApiBaseUrl],
      ['education-bootstrap', withEducationBootstrapBaseUrl],
      ['finance', withFinanceApiBaseUrl],
    ] as const;

    const urls = await Promise.all(
      helpers.map(async ([name, withBaseUrl]) => {
        const fetchMock = createFetchMock();
        const client = createInternalApiClient({
          ...withBaseUrl(),
          fetch: fetchMock as unknown as typeof fetch,
        });

        await client.fetch('/api/v1/probe');
        return [name, String(fetchMock.mock.calls[0]?.[0])];
      })
    );

    expect(urls).toMatchInlineSnapshot(`
      [
        [
          "tasks",
          "https://tasks.example.com/api/v1/probe",
        ],
        [
          "mail",
          "https://mail.example.com/api/v1/probe",
        ],
        [
          "learn",
          "https://learn.example.com/api/v1/probe",
        ],
        [
          "teach",
          "https://teach.example.com/api/v1/probe",
        ],
        [
          "pay",
          "https://pay.example.com/api/v1/probe",
        ],
        [
          "contacts",
          "https://contacts.example.com/api/v1/probe",
        ],
        [
          "education-bootstrap",
          "https://learn.example.com/api/v1/probe",
        ],
        [
          "finance",
          "https://finance.example.com/api/v1/probe",
        ],
      ]
    `);
  });

  it('routes Mail and Meet app-owned helpers through the injected mounted base', async () => {
    vi.stubEnv('INTERNAL_WEB_API_ORIGIN', 'https://tuturuuu.com');
    vi.stubEnv('MAIL_APP_URL', 'https://mail.tuturuuu.com');

    const mailFetch = createFetchMock();
    await listMailMessages('ws-1', 'mailbox-1', undefined, {
      appBaseResolver: appPathFor('mail'),
      fetch: mailFetch as unknown as typeof fetch,
    });

    const meetFetch = createFetchMock();
    await getMeetPlanSnapshot('plan-1', {
      appBaseResolver: appPathFor('meet'),
      fetch: meetFetch as unknown as typeof fetch,
    });

    const centralFetch = createFetchMock();
    await createInternalApiClient({
      baseUrl: 'https://tuturuuu.com',
      fetch: centralFetch as unknown as typeof fetch,
    }).fetch('/api/v1/workspaces');

    expect(mailFetch.mock.calls[0]?.[0]).toBe(
      'https://tuturuuu.com/mail/api/v1/workspaces/ws-1/mail/mailboxes/mailbox-1/messages'
    );
    expect(meetFetch.mock.calls[0]?.[0]).toBe(
      'https://tuturuuu.com/meet/api/v1/meet/plans/plan-1'
    );
    expect(centralFetch.mock.calls[0]?.[0]).toBe(
      'https://tuturuuu.com/api/v1/workspaces'
    );
  });

  it('keeps Mail subdomain routing when no app resolver is injected', async () => {
    vi.stubEnv('npm_package_name', '');
    vi.stubEnv('MAIL_APP_URL', 'https://mail.example.com');

    const fetchMock = createFetchMock();
    await listMailMessages('ws-1', 'mailbox-1', undefined, {
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://mail.example.com/api/v1/workspaces/ws-1/mail/mailboxes/mailbox-1/messages'
    );
  });

  it('does not add the mounted prefix twice', async () => {
    const fetchMock = createFetchMock();
    await createInternalApiClient({
      baseUrl: 'https://tuturuuu.com',
      appBaseResolver: appPathFor('mail'),
      fetch: fetchMock as unknown as typeof fetch,
    }).fetch('/mail/api/v1/workspaces');

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://tuturuuu.com/mail/api/v1/workspaces'
    );
  });

  it('leaves absolute API URLs untouched', async () => {
    const fetchMock = createFetchMock();
    await createInternalApiClient({
      appBaseResolver: appPathFor('mail'),
      fetch: fetchMock as unknown as typeof fetch,
    }).fetch('https://api.example.com/api/v1/workspaces');

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://api.example.com/api/v1/workspaces'
    );
  });
});
