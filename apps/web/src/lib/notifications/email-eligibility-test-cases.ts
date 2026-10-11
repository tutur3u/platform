export const externalRecipientCases = [
  {
    label: 'unconfirmed',
    confirmed: false,
    profile: 'member@example.com',
    verified: 'member@example.com',
    expected: 'skipped',
  },
  {
    label: 'confirmed',
    confirmed: true,
    profile: 'member@example.com',
    verified: 'member@example.com',
    expected: 'sent',
  },
  {
    label: 'stale profile',
    confirmed: true,
    profile: 'old@example.com',
    verified: 'member@example.com',
    expected: 'skipped',
  },
  {
    label: 'refreshed profile',
    confirmed: true,
    profile: 'new@example.com',
    verified: 'new@example.com',
    expected: 'sent',
  },
];
