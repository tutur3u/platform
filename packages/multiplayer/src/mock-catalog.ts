import { riseMetadata } from './mock-rise-metadata';

export const mockAppCatalog = [
  { id: 'drive', name: 'Google Drive', kind: 'documents' },
  { id: 'notion', name: 'Notion', kind: 'documents' },
  { id: 'zalo', name: 'Zalo', kind: 'chat' },
  { id: 'messenger', name: 'Messenger', kind: 'chat' },
  { id: 'teams', name: 'Microsoft Teams', kind: 'chat' },
  { id: 'calendar', name: 'Google Calendar', kind: 'calendar' },
  { id: 'jira', name: 'Jira', kind: 'board' },
  { id: 'trello', name: 'Trello', kind: 'board' },
  { id: 'gmail', name: 'Gmail', kind: 'chat' },
  { id: 'slack', name: 'Slack', kind: 'chat' },
  { id: 'sheets', name: 'Google Sheets', kind: 'documents' },
  { id: 'github', name: 'GitHub', kind: 'board' },
  { id: 'outlook', name: 'Outlook', kind: 'chat' },
  { id: 'discord', name: 'Discord', kind: 'chat' },
  { id: 'linear', name: 'Linear', kind: 'board' },
  { id: 'asana', name: 'Asana', kind: 'board' },
  { id: 'clickup', name: 'ClickUp', kind: 'board' },
  { id: 'airtable', name: 'Airtable', kind: 'documents' },
  { id: 'dropbox', name: 'Dropbox', kind: 'documents' },
  { id: 'hubspot', name: 'HubSpot', kind: 'documents' },
  { id: 'salesforce', name: 'Salesforce', kind: 'documents' },
  { id: 'figma', name: 'Figma', kind: 'documents' },
  { id: 'confluence', name: 'Confluence', kind: 'documents' },
  { id: 'zoom', name: 'Zoom', kind: 'calendar' },
] as const;

export type MockApp = (typeof mockAppCatalog)[number]['id'];
export type MockAppKind = (typeof mockAppCatalog)[number]['kind'];
export type MockRecord = {
  id: string;
  app: MockApp;
  title: string;
  content: string;
};

type RisePracticeRecord = {
  primary: readonly [string, string];
  followup: readonly [string, string];
};

const risePracticeRecords: Record<MockApp, RisePracticeRecord> = {
  // biome-ignore format: Keep scenario fixtures compact enough for the source-size gate.
  drive: { primary: ['RISE Pathways campaign brief', 'Introduce Marketing & Growth, Product & Development, External Relations, and People & Culture as four ways for students to find their place and build impact.'], followup: ['Bilingual launch copy', 'English and Vietnamese drafts are ready for department leads to review. The registration links must be checked before publishing.'] },
  // biome-ignore format: Keep scenario fixtures compact enough for the source-size gate.
  notion: { primary: ['RISE operating handbook', 'Use AI to reduce repetitive work while keeping decisions, outreach, publishing, and assessed coursework under human control.'], followup: ['Department responsibilities', 'Marketing tells the story; Product shapes experiences; External Relations builds partnerships; People & Culture supports members.'] },
  // biome-ignore format: Keep scenario fixtures compact enough for the source-size gate.
  zalo: { primary: ['People & Culture check-in', 'Several new members are unsure which pathway fits them. Draft a warm Vietnamese follow-up with a short self-reflection exercise.'], followup: ['Induction reminders', 'Send time and venue reminders only after the event lead confirms the final run sheet.'] },
  // biome-ignore format: Keep scenario fixtures compact enough for the source-size gate.
  messenger: { primary: ['Prospective member question', 'A student enjoys storytelling and community building but has never joined a club. Explain how Marketing & Growth could help them learn.'], followup: ['Study workload concern', 'A member is worried club work will conflict with an assignment deadline. Suggest a respectful way to raise capacity early.'] },
  // biome-ignore format: Keep scenario fixtures compact enough for the source-size gate.
  teams: { primary: ['RISE cross-department planning', 'Product needs event requirements, Marketing needs the final value proposition, and External Relations is waiting on the partner list.'], followup: ['People & Culture pulse', 'The team has energy but unclear ownership. Turn the discussion into decisions, owners, and follow-up questions.'] },
  // biome-ignore format: Keep scenario fixtures compact enough for the source-size gate.
  calendar: { primary: ['Induction Day & Start Up Showcase', 'Draft event window: Thursday, 13:00–17:00. Venue and speaker availability are not yet confirmed.'], followup: ['Student focus blocks', 'Protect class time and assignment deadlines when proposing RISE meetings. Never schedule from availability alone.'] },
  // biome-ignore format: Keep scenario fixtures compact enough for the source-size gate.
  jira: { primary: ['RISE-31: Induction experience', 'Product & Development is mapping the newcomer journey. Acceptance criteria need accessibility and feedback checkpoints.'], followup: ['RISE-42: Recruitment campaign', 'Marketing & Growth is blocked until all four department leads approve their role descriptions.'] },
  // biome-ignore format: Keep scenario fixtures compact enough for the source-size gate.
  trello: { primary: ['Pathways content board', 'Cards are grouped by Marketing, Product, External Relations, and People & Culture with clear owners and approval states.'], followup: ['Showcase readiness', 'Venue, demo teams, volunteer roster, and partner welcome pack are not all ready yet.'] },
  // biome-ignore format: Keep scenario fixtures compact enough for the source-size gate.
  gmail: { primary: ['Draft: Meet the pathways to innovation', 'A bilingual recruitment email introduces four RISE departments and invites students to explore roles, attend Induction Day, and apply.'], followup: ['Partnership introduction', 'External Relations drafted a university-industry introduction. The contact, shared purpose, and requested next step need review.'] },
  slack: {
    primary: [
      '#rise-operations',
      'Please post concise weekly updates using: outcome, evidence, blocker, owner, and next checkpoint.',
    ],
    followup: [
      '#study-together',
      'Members are sharing AI study workflows for summarizing notes, planning assignments, and preparing questions without outsourcing learning.',
    ],
  },
  sheets: {
    primary: [
      'RISE recruitment funnel',
      'Track awareness, role-guide views, Induction Day registrations, applications, and onboarding completion without storing unnecessary personal data.',
    ],
    followup: [
      'Semester capacity plan',
      'Each department listed class-heavy weeks, available contributors, and work that can be paused or automated.',
    ],
  },
  github: {
    primary: [
      'rise-showcase-site · issue #18',
      'Product & Development is improving the mobile application flow and needs review from Marketing and People & Culture.',
    ],
    followup: [
      'AI contribution guide',
      'Use AI for exploration, tests, and documentation; contributors remain responsible for reviewing code and explaining decisions.',
    ],
  },
  outlook: {
    primary: [
      'RISE weekly leadership digest',
      'Summarize department progress, decisions needed, student workload risks, and cross-team dependencies in under 250 words.',
    ],
    followup: [
      'RMIT stakeholder update',
      'The draft must distinguish confirmed event details from proposals awaiting Student Life approval.',
    ],
  },
  discord: {
    primary: [
      '#startup-showcase-lab',
      'Teams practice explaining the problem, user insight, proposed solution, impact, and next experiment in two minutes.',
    ],
    followup: [
      'Peer feedback',
      'Convert supportive comments into themes without erasing minority opinions or inventing consensus.',
    ],
  },
  linear: {
    primary: [
      'RISE-108 · Department role guide',
      'Create a scannable comparison of the four pathways with example tasks, skills members can develop, and ways to contribute.',
    ],
    followup: [
      'RISE-114 · Member onboarding',
      'People & Culture is designing a first-week checklist with a buddy introduction and realistic workload agreement.',
    ],
  },
  asana: {
    primary: [
      'RISE Induction Day plan',
      'Milestones cover registration, venue, speakers, activities, volunteer briefing, follow-up, and retrospective.',
    ],
    followup: [
      'Semester project portfolio',
      'Review each initiative for student value, social impact, owner capacity, dependencies, and a measurable next experiment.',
    ],
  },
  clickup: {
    primary: [
      'Marketing & Growth workspace',
      'Repurpose the pathways announcement into a carousel, short video outline, email, and campus-community post without changing approved claims.',
    ],
    followup: [
      'Product discovery sprint',
      'Turn member interviews into anonymized needs, opportunity themes, assumptions, and small experiments.',
    ],
  },
  airtable: {
    primary: [
      'RISE member skills directory',
      'Members opt in with interests, department, skills they want to practice, and availability. Sensitive notes are excluded.',
    ],
    followup: [
      'Partner relationship map',
      'External Relations tracks organization, shared purpose, relationship owner, last contact, next step, and consent-safe notes.',
    ],
  },
  dropbox: {
    primary: [
      'RISE shared creative library',
      'Approved logos, pathway visuals, event templates, and working files are separated clearly.',
    ],
    followup: [
      'Induction Day media',
      'People shown in event photos need appropriate consent before anything is published.',
    ],
  },
  hubspot: {
    primary: [
      'RISE community journey',
      'Plan helpful touchpoints from first interest to Induction Day, application, onboarding, contribution, and alumni connection.',
    ],
    followup: [
      'Partner follow-up queue',
      'Prioritize warm, relevant relationships and draft personalized follow-ups for the relationship owner to review.',
    ],
  },
  salesforce: {
    primary: [
      'Social-impact ecosystem view',
      'Group potential mentors, founders, enterprises, nonprofits, and university teams by shared purpose—not just reach.',
    ],
    followup: [
      'Collaboration opportunity',
      'A partner may support the Start Up Showcase, but budget, availability, and decision authority are unconfirmed.',
    ],
  },
  figma: {
    primary: [
      'RISE Pathways campaign',
      'Four visual pathways lead to one shared destination: Find Your Place. Build Your Impact.',
    ],
    followup: [
      'Induction experience map',
      'Product & Development mapped the journey from arrival and icebreakers to role exploration, showcase, questions, and next steps.',
    ],
  },
  confluence: {
    primary: [
      'RISE AI playbook',
      'Reusable workflows cover meeting preparation, research synthesis, project planning, bilingual drafting, and study support with human checkpoints.',
    ],
    followup: [
      'Responsible study guide',
      'AI may help explain, question, structure, and review; students must follow course rules and submit work they understand.',
    ],
  },
  zoom: {
    primary: [
      'RISE department discovery rooms',
      'Four short conversations let students meet each department, try a realistic task, and reflect on where they want to grow.',
    ],
    followup: [
      'Showcase rehearsal',
      'Record only with consent. Produce action items and open questions, then let speakers approve the recap.',
    ],
  },
};

export const mockApps: MockApp[] = mockAppCatalog.map(({ id }) => id);

export function seedRecords(): MockRecord[] {
  return mockAppCatalog.flatMap(({ id: app, name }, appIndex) => {
    const riseRecords = risePracticeRecords[app];
    const profile = {
      ...riseRecords,
      ...riseMetadata(
        name,
        appIndex,
        riseRecords.primary[0],
        riseRecords.followup[0]
      ),
    };
    const entries: ReadonlyArray<readonly [string, string]> = [
      profile.primary,
      profile.followup,
      ['Owner and collaborators', `${profile.owner} ${profile.collaborators}`],
      ['Timeline', profile.timeline],
      ['Current status', profile.status],
      ['Access and privacy', profile.access],
      ['Risk to check', profile.risk],
      ['Snapshot and next action', `${profile.metric} Next: ${profile.next}`],
    ];
    return entries.map(([title, content], index) => ({
      id: `${app}-${index + 1}`,
      app,
      title,
      content,
    }));
  });
}
