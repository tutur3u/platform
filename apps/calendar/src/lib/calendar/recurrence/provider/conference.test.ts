import { describe, expect, it } from 'vitest';
import {
  assertNoCopiedConferenceLink,
  freshProviderConference,
  verifyFreshProviderConference,
} from './conference';

const google = {
  conferenceData: {
    conferenceId: 'old-id',
    conferenceSolution: { key: { type: 'hangoutsMeet' } },
  },
  hangoutLink: 'https://meet.google.com/old-fixture',
};
const outlook = {
  isOnlineMeeting: true,
  onlineMeetingProvider: 'teamsForBusiness',
  onlineMeeting: { joinUrl: 'https://teams.microsoft.com/old-fixture' },
};
describe('fresh recurrence conference boundaries', () => {
  it.each([
    { description: google.hangoutLink },
    { description: encodeURIComponent(google.hangoutLink) },
    { description: 'Original room old-id' },
  ])('rejects embedded original Google meeting credentials', (fields) => {
    expect(() => assertNoCopiedConferenceLink(google, fields)).toThrow();
  });
  it('rejects embedded Outlook meeting HTML before reservation', () => {
    expect(() =>
      assertNoCopiedConferenceLink(outlook, {
        body: {
          content: `<a href="${outlook.onlineMeeting.joinUrl}">Join</a>`,
        },
      })
    ).toThrow();
    expect(() =>
      assertNoCopiedConferenceLink(outlook, { body: { content: 'Agenda' } })
    ).not.toThrow();
  });
  it.each([
    'https&colon;&sol;&sol;teams.microsoft.com&sol;old-fixture',
    'https&#58;&#47;&#47;teams.microsoft.com&#47;old-fixture',
    'https&#x3a;&#x2f;&#x2f;teams.microsoft.com&#x2f;old-fixture',
    'https://teams.microsoft.com/%6fld-fixture',
    'https://teams.micro&#10;soft.com/old-fixture',
    'https://teams.micro\nsoft.com/old-fixture',
    'https:/teams.microsoft.com/old-fixture',
    String.raw`https:\\teams.microsoft.com\old-fixture`,
    '//teams.microsoft.com/old-fixture',
    'https://teams.microsoft.com/discard/../old-fixture',
  ])('rejects encoded original Outlook href %s', (url) => {
    expect(() =>
      assertNoCopiedConferenceLink(outlook, {
        body: {
          contentType: 'html',
          content: `<a href="${url}">Join</a> Agenda 50%`,
        },
      })
    ).toThrow('original meeting link');
  });
  it('rejects a valid encoded path even beside malformed UTF-8 escapes', () => {
    expect(() =>
      assertNoCopiedConferenceLink(outlook, {
        body: {
          content: 'Invalid %FF; https://teams.microsoft.com/%6fld-fixture',
        },
      })
    ).toThrow('original meeting link');
  });
  it('retains original joining links embedded in redirect query parameters', () => {
    expect(() =>
      assertNoCopiedConferenceLink(outlook, {
        description: `https://redirect.example.invalid/?join=${outlook.onlineMeeting.joinUrl}`,
      })
    ).toThrow('original meeting link');
  });
  it('retains original conference IDs in unrelated URL query parameters', () => {
    expect(() =>
      assertNoCopiedConferenceLink(google, {
        description: `https://redirect.example.invalid/?room=${google.conferenceData.conferenceId}`,
      })
    ).toThrow('original meeting link');
  });
  it('checks raw content alongside decoded variants without mutating benign metadata', () => {
    const fields = {
      body: {
        contentType: 'html',
        content: '<p>Agenda &amp; notes &#37; %FF</p>',
      },
    };
    const before = structuredClone(fields);
    expect(() => assertNoCopiedConferenceLink(outlook, fields)).not.toThrow();
    expect(fields).toEqual(before);
  });
  it('creates stable Google requests without copying join credentials or signatures', () => {
    const first = freshProviderConference(
      'google',
      {
        ...google,
        conferenceData: {
          ...google.conferenceData,
          signature: 'private-fixture',
        },
      },
      'operation'
    );
    expect(first).toEqual(
      freshProviderConference('google', google, 'operation')
    );
    expect(JSON.stringify(first)).not.toContain('old-fixture');
    expect(JSON.stringify(first)).not.toContain('private-fixture');
    expect(first?.fields).toMatchObject({
      conferenceData: {
        createRequest: { conferenceSolutionKey: { type: 'hangoutsMeet' } },
      },
    });
    expect(first).not.toEqual(
      freshProviderConference('google', google, 'other-operation')
    );
  });
  it('requests a new Outlook meeting without carrying the original joining URL', () => {
    const result = freshProviderConference('microsoft', outlook, 'operation');
    expect(result?.fields).toEqual({
      isOnlineMeeting: true,
      onlineMeetingProvider: 'teamsForBusiness',
    });
    expect(JSON.stringify(result)).not.toContain('old-fixture');
  });
  it.each(['skypeForBusiness', 'skypeForConsumer', 'teamsForBusiness'])(
    'retains only supported Outlook meeting provider %s',
    (onlineMeetingProvider) => {
      expect(
        freshProviderConference(
          'microsoft',
          { ...outlook, onlineMeetingProvider },
          'operation'
        )?.fields
      ).toMatchObject({ onlineMeetingProvider });
    }
  );
  it.each([
    { ...google, conferenceData: undefined },
    {
      ...google,
      conferenceData: {
        conferenceId: 'old',
        conferenceSolution: { key: { type: 'addOn' } },
      },
    },
    { ...google, hangoutLink: 'http://meet.google.com/fixture' },
    {
      ...google,
      hangoutLink: 'https://meet.google.com.attacker.invalid/fixture',
    },
  ])(
    'rejects unsupported Google conference state before reservation',
    (master) => {
      expect(() =>
        freshProviderConference('google', master, 'operation')
      ).toThrow();
    }
  );
  it.each([
    { ...outlook, isOnlineMeeting: false },
    { ...outlook, onlineMeetingProvider: 'unknown' },
    {
      ...outlook,
      onlineMeeting: {
        joinUrl: 'https://user:password@teams.microsoft.com/fixture',
      },
    },
  ])('rejects incomplete Outlook conference state', (master) => {
    expect(() =>
      freshProviderConference('microsoft', master, 'operation')
    ).toThrow();
  });
  it('holds Google pending/failed and reused identities until a new conference is successful', () => {
    const excluded = freshProviderConference(
      'google',
      google,
      'operation'
    )!.excludedConferenceHash;
    const ready = {
      conferenceData: {
        conferenceId: 'new-id',
        conferenceSolution: { key: { type: 'hangoutsMeet' } },
        createRequest: { status: { statusCode: 'success' } },
      },
      hangoutLink: 'https://meet.google.com/new-fixture',
    };
    expect(() =>
      verifyFreshProviderConference('google', ready, excluded)
    ).not.toThrow();
    for (const statusCode of ['pending', 'failure'])
      expect(() =>
        verifyFreshProviderConference(
          'google',
          {
            ...ready,
            conferenceData: {
              ...ready.conferenceData,
              createRequest: { status: { statusCode } },
            },
          },
          excluded
        )
      ).toThrow();
    expect(() =>
      verifyFreshProviderConference(
        'google',
        {
          ...ready,
          conferenceData: { ...ready.conferenceData, conferenceId: 'old-id' },
        },
        excluded
      )
    ).toThrow('identity');
    expect(() =>
      verifyFreshProviderConference(
        'google',
        { ...ready, hangoutLink: google.hangoutLink },
        excluded,
        freshProviderConference('google', google, 'operation')!.excludedJoinHash
      )
    ).toThrow();
  });
  it('holds Outlook until a fresh valid provider meeting is available', () => {
    const excluded = freshProviderConference(
      'microsoft',
      outlook,
      'operation'
    )!.excludedConferenceHash;
    expect(() =>
      verifyFreshProviderConference('microsoft', outlook, excluded)
    ).toThrow();
    expect(() =>
      verifyFreshProviderConference(
        'microsoft',
        {
          ...outlook,
          onlineMeeting: {
            joinUrl: `${outlook.onlineMeeting.joinUrl}?context=changed`,
          },
        },
        excluded
      )
    ).toThrow();
    expect(() =>
      verifyFreshProviderConference(
        'microsoft',
        {
          ...outlook,
          onlineMeeting: { joinUrl: 'https://teams.microsoft.com/new-fixture' },
        },
        excluded
      )
    ).not.toThrow();
    expect(() =>
      verifyFreshProviderConference(
        'microsoft',
        {
          ...outlook,
          onlineMeetingProvider: 'unknown',
          onlineMeeting: { joinUrl: 'https://teams.microsoft.com/new-fixture' },
        },
        excluded
      )
    ).toThrow();
  });
});
