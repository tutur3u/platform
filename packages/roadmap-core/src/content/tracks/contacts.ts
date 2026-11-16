import type { Track } from '../../live/status.ts';

export const contactsTrack: Track = {
  id: 'contacts',
  name: 'Contacts (CRM)',
  summary:
    'People, groups, attendance and reports for workspaces that run classes and teams.',
  milestones: [
    {
      id: 'contacts-reports',
      title: 'Reports that send themselves',
      deliverables: [
        {
          id: 'contacts-report-delivery',
          title: 'Approved reports are tracked and sent automatically',
          prs: [5300],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'contacts-report-statuses',
          title: 'Familiar report statuses and branded monthly emails',
          prs: [5309],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'contacts-delivery-worklist',
          title: 'Delivery worklist that sends in batches of 100',
          prs: [6100],
          app: 'contacts',
          fallback: 'planned',
        },
        {
          id: 'contacts-reports-worklist',
          title: 'One Reports worklist with exact filtered totals',
          prs: [6124],
          app: 'contacts',
          fallback: 'planned',
        },
        {
          id: 'contacts-report-month-filter',
          title: 'Monthly reports filtered by report month',
          prs: [7887],
          app: 'contacts',
          fallback: 'planned',
        },
      ],
    },
    {
      id: 'contacts-attendance',
      title: 'Attendance you can trust',
      deliverables: [
        {
          id: 'contacts-attendance-saves',
          title: 'Attendance edits survive saves and failures',
          prs: [6332, 6335],
          app: 'contacts',
          fallback: 'planned',
        },
        {
          id: 'contacts-pick-topic-contact',
          title: 'Pick an existing contact when adding one',
          prs: [7047],
          app: 'contacts',
          fallback: 'planned',
        },
      ],
    },
    {
      id: 'contacts-earlier-groups',
      title: 'Earlier: Users and groups',
      summary: '2023 to 2024.',
      deliverables: [
        {
          id: 'contacts-user-groups',
          title: 'Workspace user groups',
          prs: [891],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'contacts-group-members',
          title: 'Manage members and tags in user groups',
          prs: [1666, 1702],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'contacts-user-import',
          title: 'Import workspace users',
          prs: [1963],
          app: null,
          fallback: 'planned',
        },
      ],
    },
    {
      id: 'contacts-earlier-attendance',
      title: 'Earlier: Attendance and reports',
      summary: '2024 to early 2026.',
      deliverables: [
        {
          id: 'contacts-self-serve-attendance',
          title: 'Self-serve attendance',
          prs: [1893],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'contacts-group-schedules',
          title: 'Group schedules and reports',
          prs: [1905],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'contacts-attendance-revamp',
          title: 'Revamped attendance page',
          prs: [4215],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'contacts-report-approvals',
          title: 'Approval workflow for reports and posts',
          prs: [4266, 4309],
          app: null,
          fallback: 'planned',
        },
      ],
    },
  ],
};
