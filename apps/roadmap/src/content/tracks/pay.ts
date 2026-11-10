import type { Track } from '../../live/status.ts';

export const payTrack: Track = {
  id: 'pay',
  name: 'Billing & Pay',
  summary: 'Plans, seats, invoices and checkout for Tuturuuu workspaces.',
  milestones: [
    {
      id: 'pay-pricing',
      title: 'Clearer pricing',
      deliverables: [
        {
          id: 'pay-compare-apps',
          title: 'Pricing page compares every app',
          prs: [5335],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'pay-comparison-redesign',
          title: 'Redesigned product comparison',
          prs: [5348],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'pay-invoice-history',
          title: 'Verified checkout receipts and invoice history',
          prs: [5341],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'pay-billing-picker',
          title: 'Pay opens the workspaces you can bill',
          prs: [6386],
          app: 'pay',
          fallback: 'planned',
        },
      ],
    },
    {
      id: 'pay-seats',
      title: 'Seat-based plans',
      summary: 'Early 2026.',
      deliverables: [
        {
          id: 'pay-plan-change-proration',
          title: 'Plan changes show prorated prices first',
          prs: [4220],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'pay-free-tier',
          title: 'Full support for the free plan',
          prs: [4250],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'pay-seat-pricing',
          title: 'Seat-based pricing for team workspaces',
          prs: [4257, 4298],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'pay-billing-details',
          title: 'Payment details on the billing page',
          prs: [4401],
          app: null,
          fallback: 'planned',
        },
      ],
    },
    {
      id: 'pay-earlier',
      title: 'Earlier: Payments',
      summary: '2025.',
      deliverables: [
        {
          id: 'pay-first-payments',
          title: 'First workspace payment system',
          prs: [3094, 3112],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'pay-cancel-plan',
          title: 'Cancel a subscription from billing',
          prs: [3276],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'pay-subscription-invoices',
          title: 'Subscription invoices',
          prs: [3601],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'pay-orders',
          title: 'Order history for each subscription',
          prs: [4087, 4094],
          app: null,
          fallback: 'planned',
        },
      ],
    },
  ],
};
