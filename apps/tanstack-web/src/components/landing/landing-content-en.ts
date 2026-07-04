import type { LandingContent } from './landing-content';

export const englishLandingContent = {
  meta: {
    description:
      'The all-in-one workspace that brings your tasks, calendar, documents, and team together.',
    title: 'Tuturuuu - Intelligent Workspace Platform',
  },
  hero: {
    badge: 'Intelligent Workspace Platform',
    description:
      'The all-in-one workspace that brings your tasks, calendar, documents, and team together.',
    previewCards: [
      {
        items: ['Design review', 'API integration', 'User testing'],
        label: 'Tasks',
      },
      {
        items: ['Team standup', 'Client call', 'Sprint planning'],
        label: 'Calendar',
      },
      {
        items: ['Project updates', 'Quick sync', 'Feedback'],
        label: 'Chat',
      },
      {
        items: ['87% productivity', '24 tasks done', '18.5h focused'],
        label: 'Analytics',
      },
    ],
    primaryCta: 'Get Started Free',
    title: {
      line1: 'Work Smarter.',
      line2: 'Live Better.',
    },
    trust: ['Open Source', '10,000+ Commits', 'Free Forever'],
    video: {
      badge: 'Watch Demo',
      thumbnail: 'Tuturuuu Platform Demo',
      title: 'Tuturuuu Platform Demo Video',
      watchNow: 'Click to watch the full demo',
    },
  },
  problem: {
    stats: [
      { label: 'wasted per day', value: '3 hrs' },
      { label: 'context lost', value: '47%' },
      { label: 'apps used daily', value: '12+' },
    ],
    subtitle: 'Tuturuuu brings everything into one place.',
    title: "You're drowning in tools. We get it.",
  },
  features: {
    apps: {
      nova: {
        description:
          'Practice prompt engineering, compete in AI challenges, and level up your skills with hands-on learning.',
        highlights: ['AI challenges', 'Skill tracking', 'Leaderboards'],
        subtitle: 'Learning Platform',
        title: 'Nova',
      },
      tuchat: {
        description:
          'Integrated communications hub where AI surfaces commitments and routes them to tasks and calendar.',
        highlights: ['Team chat', 'AI insights', 'Auto-routing'],
        subtitle: 'Smart Communications',
        title: 'TuChat',
      },
      tudo: {
        description:
          'Centralized task hub with hierarchical organization, bucket dump feature, and seamless calendar integration.',
        highlights: [
          'Kanban boards',
          'Hierarchical tasks',
          'Project management',
        ],
        subtitle: 'Smart Tasks',
        title: 'Tuturuuu Tasks',
      },
      tufinance: {
        description:
          'Track expenses, manage budgets, and gain AI-powered insights into your financial health.',
        highlights: [
          'Expense tracking',
          'Budget planning',
          'Financial analytics',
        ],
        subtitle: 'Finance Management',
        title: 'Tuturuuu Finance',
      },
      tumeet: {
        description:
          'End-to-end meeting solution with collaborative planning, location intelligence, and AI-generated summaries.',
        highlights: ['Meeting plans', 'AI transcription', 'Action tracking'],
        subtitle: 'Smart Meetings',
        title: 'Tuturuuu Meet',
      },
      tuplan: {
        description:
          'AI-powered auto-scheduling that allocates time based on deadlines, priorities, and your personal work rhythms.',
        highlights: [
          'Google Calendar sync',
          'Auto-scheduling',
          'Time blocking',
        ],
        subtitle: 'Smart Calendar',
        title: 'Tuturuuu Calendar',
      },
    },
    subtitle: 'One platform for your entire workflow',
    title: 'Everything you need',
  },
  demo: {
    badge: 'Live Demo',
    panels: [
      {
        cta: 'Try Smart Calendar',
        details: [
          'Team Standup',
          'Focus Time: Deep Work',
          'Client Presentation',
        ],
        subtitle: 'AI-powered scheduling and time blocking',
        title: 'Smart Calendar',
      },
      {
        cta: 'Try Task Management',
        details: [
          'Review marketing proposal',
          'Implement calendar sync feature',
          'Plan team offsite event',
        ],
        subtitle: 'Hierarchical organization with AI insights',
        title: 'Smart Task Management',
      },
      {
        cta: 'Chat with Mira',
        details: [
          "What's on my agenda for tomorrow?",
          'Summarize my tasks for this week',
          'Help me prioritize my project deadlines',
        ],
        subtitle: 'Your proactive AI companion',
        title: 'AI Assistant (Mira)',
      },
    ],
    subtitle:
      'Experience the future of work with our interactive demos. These are real, production-ready features you can use today.',
    title: {
      highlight: 'In Action',
      part1: 'See It',
    },
  },
  ai: {
    mira: {
      capabilities: ['Proactive AI', 'Context-Aware', 'Always Learning'],
      description:
        'Mira is your proactive AI companion. She plans, reasons, and acts on your behalf, synchronizing calendars, goals, and communications to surface proactive recommendations.',
      prompts: [
        'Schedule my standup for tomorrow at 9am',
        'Summarize my tasks for this week',
        'Help me prioritize my project deadlines',
      ],
      title: 'Mira: Your AI Partner',
    },
    subtitle: 'Meet Mira, your AI assistant that understands your work.',
    title: 'Powered by intelligent AI',
  },
  pricing: {
    subtitle:
      'Plans are per workspace, billed per user. Up to 10 free workspaces per account.',
    tiers: [
      {
        cta: 'Get Started',
        description: 'For individuals exploring Tuturuuu',
        features: [
          'Basic task management',
          'Calendar sync (limited)',
          'AI chat (limited tokens)',
          'QR Generator',
        ],
        name: 'Free',
        period: 'forever',
        price: '$0',
      },
      {
        badge: 'Best Value',
        cta: 'Get Plus',
        description: 'For teams that need collaboration',
        features: [
          'Everything in Free +',
          'Unlimited Whiteboards',
          '20GB Drive storage',
          'Granular permissions',
        ],
        name: 'Plus',
        period: '/user/mo',
        price: '$8',
      },
      {
        badge: 'Most Powerful',
        cta: 'Get Pro',
        description: 'For power teams that need it all',
        features: [
          'Everything in Plus +',
          'Unlimited AI',
          'Priority support',
          'Reports & Analytics',
        ],
        name: 'Pro',
        period: '/user/mo',
        price: '$15',
      },
    ],
    title: 'Simple pricing. No surprises.',
  },
  socialProof: {
    backedBy: 'Powered by',
    cta: 'View on GitHub',
    stats: [
      { label: 'Commits', value: '10,000+' },
      { label: 'Contributors', value: '30+' },
      { label: 'Years of Innovation', value: '3.5+' },
    ],
    title: 'Built in the open',
  },
  cta: {
    description:
      "Join thousands of professionals who've eliminated digital friction and regained focus. Start with our free plan-no credit card required.",
    note: 'No credit card required. Free forever plan available.',
    primary: 'Get Started Free',
    secondary: 'Talk to Sales',
    title: 'Ready to work smarter?',
    trust: [
      'Open Source & Transparent',
      'Enterprise-Grade Security',
      'Self-Hostable',
    ],
  },
} satisfies LandingContent;
