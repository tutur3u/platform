import type { Track } from '../../live/status.ts';

export const calendarTrack: Track = {
  id: 'calendar',
  name: 'Calendar',
  summary:
    'Recurring events that sync cleanly with Google and Outlook, and accounts that recover on their own.',
  milestones: [
    {
      id: 'calendar-guests',
      title: 'Guests and invitations',
      titleVi: 'Khách mời và lời mời',
      deliverables: [
        {
          id: 'calendar-event-guests',
          title: 'Invite guests with RSVP links and calendar files',
          titleVi: 'Mời khách kèm liên kết phản hồi và tệp lịch',
          prs: [],
          commits: [
            'bf6ca04a38a0c3ca4cca5a47a84ac3a7e63527cf',
            '0eaae7db650655e4856673047c86bbe4a8eb74b6',
          ],
          app: 'calendar',
          fallback: 'planned',
        },
        {
          id: 'calendar-meet-in-event',
          title: 'Manage guests and add a Tuturuuu Meet link from the event dialog',
          titleVi: 'Quản lý khách mời và thêm liên kết Tuturuuu Meet ngay trong hộp thoại sự kiện',
          prs: [],
          commits: [
            '6d2a653604ea6583ca1b455605b265fb6837492c',
          ],
          app: 'calendar',
          fallback: 'planned',
        },
      ],
    },
    {
      id: 'calendar-recurrence',
      title: 'Recurring events',
      deliverables: [
        {
          id: 'recurring-create-edit',
          title: 'Create recurring events and edit one, future or all',
          prs: [5825, 5819],
          app: 'calendar',
          fallback: 'planned',
        },
        {
          id: 'recurring-monthly-yearly',
          title: 'Monthly and yearly “nth weekday” repeats',
          prs: [5864],
          app: 'calendar',
          fallback: 'planned',
        },
        {
          id: 'recurring-provider-sync',
          title: 'Recurring series stay in sync with Google and Outlook',
          prs: [5808, 5834],
          app: 'calendar',
          fallback: 'planned',
        },
        {
          id: 'recurring-readonly',
          title: 'Unsupported provider repeats shown read-only, not broken',
          prs: [5844],
          app: 'calendar',
          fallback: 'planned',
        },
      ],
    },
    {
      id: 'calendar-accounts',
      title: 'Connected calendars',
      deliverables: [
        {
          id: 'oauth-self-heal',
          title: 'Calendar sync recovers from revoked Google or Outlook access',
          prs: [6835],
          app: 'calendar',
          fallback: 'planned',
        },
        {
          id: 'reconnect-prompt',
          title: 'Prompt to reconnect a paused calendar account',
          prs: [6846],
          app: 'calendar',
          fallback: 'planned',
        },
        {
          id: 'google-colors',
          title: 'Full Google event colour choices',
          prs: [5661],
          app: 'calendar',
          fallback: 'planned',
        },
        {
          id: 'event-link-previews',
          title: 'Link previews for events',
          prs: [5672],
          app: 'calendar',
          fallback: 'planned',
        },
      ],
    },
    {
      id: 'calendar-speed',
      title: 'Faster Calendar',
      deliverables: [
        {
          id: 'calendar-startup',
          title: 'Faster Calendar startup',
          prs: [5866, 5867, 5868],
          app: 'calendar',
          fallback: 'planned',
        },
        {
          id: 'calendar-task-summaries',
          title: 'Faster task scheduling summaries',
          prs: [5827],
          app: 'calendar',
          fallback: 'planned',
        },
        {
          id: 'calendar-edge',
          title: 'Calendar on the new edge runtime',
          prs: [6791, 6952],
          app: 'calendar',
          fallback: 'planned',
        },
      ],
    },
    {
      id: 'calendar-mobile',
      title: 'Calendar on mobile',
      deliverables: [
        {
          id: 'calendar-mobile-sheets',
          title: 'Event editors in native sheets',
          prs: [6631],
          app: 'mobile',
          fallback: 'planned',
        },
        {
          id: 'calendar-mobile-settings',
          title: 'Calendar settings available instantly',
          prs: [6657],
          app: 'mobile',
          fallback: 'planned',
        },
        {
          id: 'calendar-home-up-next',
          title: 'Home shows Today and Up next from your calendar',
          prs: [6893],
          app: 'mobile',
          fallback: 'planned',
        },
      ],
    },
  ],
};
