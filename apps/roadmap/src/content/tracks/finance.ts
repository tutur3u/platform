import type { Track } from '../../live/status.ts';

export const financeTrack: Track = {
  id: 'finance',
  name: 'Finance',
  summary:
    'Accurate tuition and invoices, plus monthly fee locks with notices and exports.',
  milestones: [
    {
      id: 'finance-fee-lock',
      title: 'Monthly fee locks',
      summary:
        'Lock monthly fees, send notices and export them (rolling out behind a flag).',
      deliverables: [
        {
          id: 'fee-lock-month-view',
          title: 'Monthly fee-lock page with filters',
          prs: [7541, 7542, 7543],
          app: 'finance',
          fallback: 'planned',
        },
        {
          id: 'fee-lock-save-lock',
          title: 'Save, lock and reopen monthly fees, one or many at a time',
          prs: [7555, 7558, 7560],
          app: 'finance',
          fallback: 'planned',
        },
        {
          id: 'fee-lock-excel',
          title: 'Export fee locks to Excel',
          prs: [7564, 7565, 7570],
          app: 'finance',
          fallback: 'planned',
        },
        {
          id: 'fee-lock-notices',
          title: 'Fee notice templates with preview',
          prs: [7571, 7572, 7574, 7755],
          app: 'finance',
          fallback: 'planned',
        },
        {
          id: 'fee-lock-invoices',
          title: 'Subscription invoices pre-filled from locked fees',
          prs: [7576, 7577, 7579],
          app: 'finance',
          fallback: 'planned',
        },
      ],
    },
    {
      id: 'finance-accuracy',
      title: 'More accurate tuition and invoices',
      deliverables: [
        {
          id: 'recurring-sessions-preview',
          title: 'Subscription previews count recurring sessions',
          prs: [5541],
          app: 'finance',
          fallback: 'planned',
        },
        {
          id: 'class-join-dates',
          title: 'Pending tuition respects class join dates',
          prs: [5618],
          app: 'finance',
          fallback: 'planned',
        },
        {
          id: 'projected-invoice-dates',
          title: 'Stable projected invoice dates',
          prs: [6010],
          app: 'finance',
          fallback: 'planned',
        },
        {
          id: 'invoice-templates-dates',
          title: 'Invoice templates keep working with unusual dates',
          prs: [6040],
          app: 'finance',
          fallback: 'planned',
        },
        {
          id: 'attendance-summaries',
          title: 'Steadier attendance calendar summaries',
          prs: [6075],
          app: 'finance',
          fallback: 'planned',
        },
      ],
    },
    {
      id: 'finance-runtime',
      title: 'Faster Finance hosting',
      deliverables: [
        {
          id: 'finance-edge',
          title: 'Finance built for the new edge runtime',
          prs: [6757, 6842, 7621],
          app: 'finance',
          fallback: 'planned',
        },
        {
          id: 'finance-edge-cutover',
          title: 'Switch Finance over to the new runtime',
          prs: [],
          app: 'finance',
          fallback: 'in_progress',
        },
      ],
    },
  ],
};
