import type { Track } from '../../live/status.ts';

export const mailTrack: Track = {
  id: 'mail',
  name: 'Mail',
  summary:
    'A tidy inbox for workspace and personal email, with calendar invites built in.',
  milestones: [
    {
      id: 'mail-personal',
      title: 'Personal email accounts',
      deliverables: [
        {
          id: 'mail-gmail-outlook',
          title: 'Connect Gmail and Outlook as personal email',
          prs: [5997],
          app: 'mail',
          fallback: 'planned',
        },
        {
          id: 'mail-inbound-notify',
          title: 'Get notified when new mail arrives in a managed mailbox',
          prs: [6255],
          app: 'mail',
          fallback: 'planned',
        },
        {
          id: 'mail-source-settings',
          title: 'Mail source moved into Settings',
          prs: [7145],
          app: 'mail',
          fallback: 'planned',
        },
      ],
    },
    {
      id: 'mail-invites',
      title: 'Calendar invitations in Mail',
      deliverables: [
        {
          id: 'mail-rsvp',
          title: 'RSVP to invitations from your inbox',
          prs: [5668, 5818],
          app: 'mail',
          fallback: 'planned',
        },
        {
          id: 'mail-invite-calendar',
          title: 'Link invitations to Calendar with a preview',
          prs: [5671, 5673],
          app: 'mail',
          fallback: 'planned',
        },
      ],
    },
    {
      id: 'mail-inbox',
      title: 'A faster, denser inbox',
      deliverables: [
        {
          id: 'mail-inbox-density',
          title: 'Clearer inbox hierarchy and density',
          prs: [7146],
          app: 'mail',
          fallback: 'planned',
        },
        {
          id: 'mail-inbox-speed',
          title: 'Inbox list loads without waiting on setup',
          prs: [7144, 6625],
          app: 'mail',
          fallback: 'planned',
        },
        {
          id: 'mail-theme',
          title: 'Mail follows your theme and keeps emails readable',
          prs: [5948],
          app: 'mail',
          fallback: 'planned',
        },
        {
          id: 'mail-send-drafts',
          title: 'Failed sends return to Drafts with a clear error',
          prs: [8012],
          app: 'mail',
          fallback: 'in_progress',
        },
      ],
    },
    {
      id: 'mail-mobile',
      title: 'Mail on mobile',
      deliverables: [
        {
          id: 'mail-tablet-preview',
          title: 'Tablet split view with instant mail preview',
          prs: [6685],
          app: 'mobile',
          fallback: 'planned',
        },
        {
          id: 'mail-mobile-settings',
          title: 'Mail settings that work offline',
          prs: [6655],
          app: 'mobile',
          fallback: 'planned',
        },
        {
          id: 'mail-offline-inbox',
          title: 'Read your inbox list offline',
          prs: [7473],
          app: 'mobile',
          fallback: 'planned',
        },
      ],
    },
  ],
};
