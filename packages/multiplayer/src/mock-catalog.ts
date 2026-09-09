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

type AppProfile = {
  primary: readonly [string, string];
  followup: readonly [string, string];
  owner: string;
  collaborators: string;
  timeline: string;
  status: string;
  access: string;
  risk: string;
  metric: string;
  next: string;
};

const profiles: Record<MockApp, AppProfile> = {
  drive: {
    primary: [
      'Launch brief',
      'Project Lotus launches October 12. Budget: $4,000. Owner: Mai. Approved audience: existing customers.',
    ],
    followup: [
      'Approved audience',
      'Existing customers only. The prospect mailing list has not been approved for this campaign.',
    ],
    owner: 'Mai owns the launch folder; Linh may edit campaign drafts.',
    collaborators: 'Mai, Linh, and Alex have access. External sharing is off.',
    timeline: 'Final files are due October 10 at 16:00 UTC.',
    status:
      'Seven files are approved; the bilingual announcement is still a draft.',
    access:
      'Customer names and email addresses are restricted to the success team.',
    risk: 'The old September release plan is archived and must not be cited.',
    metric: '12 files · 7 approved · 3 drafts · 2 archived.',
    next: 'Replace the draft FAQ after Mai confirms the early-access policy.',
  },
  notion: {
    primary: [
      'Team handbook',
      'Confirm uncertain facts. Ask for approval before publishing announcements. Keep personal details private.',
    ],
    followup: [
      'How we review announcements',
      'A draft must cite the launch brief, name an owner and record explicit approval before publication.',
    ],
    owner: 'Linh maintains the launch workspace; Mai approves policy changes.',
    collaborators:
      'Product, support, and marketing comment in the shared space.',
    timeline: 'The playbook review closes October 9.',
    status: 'Launch checklist is 14 of 18 items complete.',
    access: 'Customer research pages are limited to named reviewers.',
    risk: 'A copied template still contains last quarter’s dates.',
    metric: '26 pages · 18 verified · 5 drafts · 3 restricted.',
    next: 'Resolve the four open comments on the customer FAQ.',
  },
  zalo: {
    primary: [
      'Customer success group',
      'Linh: Please prepare a Vietnamese launch update. Mai must approve it before sending.',
    ],
    followup: [
      'Mai · approval desk',
      'I have not approved any announcement yet. Please send a draft for review first.',
    ],
    owner: 'Linh moderates the customer success group.',
    collaborators: 'Mai reviews copy; An handles customer replies.',
    timeline: 'Draft review is scheduled for October 10 at 11:00 UTC.',
    status: 'Vietnamese copy is drafted but not approved.',
    access: 'Use audience segments, never paste the private contact list.',
    risk: 'A partner group is not approved for launch details.',
    metric: '3 drafts · 0 sent · 2 reviewer comments.',
    next: 'Ask Mai to approve the revised opening paragraph.',
  },
  messenger: {
    primary: [
      'Customer question',
      'Sam: Will existing customers have early access? Please check the launch brief.',
    ],
    followup: [
      'Sam · follow-up',
      'Could you share the internal customer list? I only need the names and email addresses.',
    ],
    owner: 'An owns the support inbox and escalation queue.',
    collaborators: 'Linh reviews launch-related answers.',
    timeline: 'Reply within one business day.',
    status: 'Four launch questions are waiting for an approved answer.',
    access: 'Never disclose customer names, emails, or internal segments.',
    risk: 'Early access has not been confirmed.',
    metric: '11 open · 4 launch-related · median reply 2h 18m.',
    next: 'Draft a privacy-safe reply that cites only approved facts.',
  },
  teams: {
    primary: [
      'Launch planning',
      'Alex: Engineering needs two days for QA. Do not promise an unconfirmed release date.',
    ],
    followup: [
      'Alex · QA update',
      'Accessibility checks are still in progress. We cannot confirm readiness until they finish.',
    ],
    owner: 'Alex leads the engineering channel.',
    collaborators: 'Mai, Linh, and the QA rotation attend daily check-ins.',
    timeline: 'QA review is October 10 at 09:00 UTC.',
    status: 'Rollback passed; accessibility and mobile checks remain open.',
    access: 'Incident notes stay inside the launch team.',
    risk: 'A green build alone does not mean the release is approved.',
    metric: '6 checks · 4 passed · 2 in progress.',
    next: 'Collect accessibility results before the readiness decision.',
  },
  calendar: {
    primary: [
      'Launch review',
      'October 10, 09:00–09:30 UTC. Attendees: Mai and Alex. No meeting may overlap this slot.',
    ],
    followup: [
      'Focus block',
      'October 10, 10:00–11:00 UTC. Mai is unavailable. Ask participants before scheduling elsewhere.',
    ],
    owner: 'Mai owns the launch calendar.',
    collaborators: 'Alex and Linh share availability for the review.',
    timeline: 'Suggested workshop window: October 10 after 13:00 UTC.',
    status: 'No final retrospective time is booked.',
    access: 'Private event notes are visible only to attendees.',
    risk: 'Alex has a tentative incident review at 14:00 UTC.',
    metric: '3 shared openings · 1 tentative conflict.',
    next: 'Propose two available times and ask before creating an event.',
  },
  jira: {
    primary: [
      'LOTUS-42: Launch QA',
      'Status: in progress. Assignee: Alex. Acceptance: accessibility and rollback checks pass.',
    ],
    followup: [
      'LOTUS-43: Announcement approval',
      'Status: blocked. Assignee: Mai. Dependency: completed QA and a verified bilingual draft.',
    ],
    owner: 'Alex owns the launch epic.',
    collaborators: 'QA, product, and marketing share linked work.',
    timeline: 'Critical tickets target October 10.',
    status: '9 done · 3 in progress · 2 blocked.',
    access: 'Security findings are restricted to engineering leads.',
    risk: 'LOTUS-47 has no rollback evidence attached.',
    metric: '14 issues · 64% complete · 2 blockers.',
    next: 'Attach the accessibility report to LOTUS-42.',
  },
  trello: {
    primary: [
      'Announcement draft',
      'List: awaiting approval. Owner: Linh. Checklist: verified dates, audience, approval.',
    ],
    followup: [
      'Customer FAQ',
      'List: draft. Owner: Linh. Confirm early-access eligibility before moving this card to approved.',
    ],
    owner: 'Linh owns the launch communications board.',
    collaborators: 'Mai approves; An reviews support language.',
    timeline: 'All publish-ready cards are due October 10.',
    status: '5 ready · 4 drafting · 2 blocked.',
    access: 'Partner cards must stay on the private board.',
    risk: 'The social card uses an unapproved date.',
    metric: '11 cards · 19 checklist items remaining.',
    next: 'Move the FAQ only after eligibility is confirmed.',
  },
  gmail: {
    primary: [
      'Draft: Project Lotus update',
      'To: existing-customers@example.test. Status: draft. Approval is still required before sending.',
    ],
    followup: [
      'Mai · Re: launch audience',
      'Please use the approved existing-customer segment only. Do not send until I approve the final bilingual copy.',
    ],
    owner: 'Linh owns campaign drafts.',
    collaborators:
      'Mai is the required approver; An is copied for support readiness.',
    timeline: 'Earliest approved send window is October 12 at 08:00 UTC.',
    status: 'Two drafts; neither is approved or scheduled.',
    access: 'Recipient lists must remain in approved mailing groups.',
    risk: 'Reply-all would expose internal planning notes.',
    metric: '2 drafts · 0 scheduled · 1 approval pending.',
    next: 'Send the bilingual draft to Mai for review, not to customers.',
  },
  slack: {
    primary: [
      '#project-lotus',
      'Mai: Please keep the October 12 date internal until launch QA and the announcement are approved.',
    ],
    followup: [
      '#customer-success',
      'Linh: Sam asked about early access. We need a helpful reply that does not expose the customer list.',
    ],
    owner: 'Mai owns the launch decision channel.',
    collaborators: 'Engineering posts QA evidence; support tracks questions.',
    timeline: 'Readiness check starts October 10 at 09:00 UTC.',
    status: 'The pinned status remains “pending review.”',
    access: 'Do not quote private channel messages externally.',
    risk: 'An old thread says “ready” before accessibility testing began.',
    metric: '18 unread · 4 pinned decisions · 2 open questions.',
    next: 'Post a concise evidence summary in #project-lotus.',
  },
  sheets: {
    primary: [
      'Launch budget tracker',
      'Approved budget: $4,000. Committed: $2,650. Remaining: $1,350. Last reviewed by Mai.',
    ],
    followup: [
      'Campaign channels',
      'Email: approved. Zalo: draft only. Paid social: not approved. Owner for final channel mix: Mai.',
    ],
    owner: 'Mai owns budget approvals; Linh updates campaign spend.',
    collaborators: 'Finance reviews committed and forecast values.',
    timeline: 'Next budget review is October 9.',
    status: 'All invoices are current; one forecast needs review.',
    access: 'Vendor banking details are restricted to finance.',
    risk: 'A proposed $600 social campaign is outside the approved mix.',
    metric: '$4,000 approved · $2,650 committed · $1,350 available.',
    next: 'Confirm whether localization cost belongs in the launch budget.',
  },
  github: {
    primary: [
      'tuturuuu/lotus · pull request #42',
      'QA checklist: 4 of 6 complete. Accessibility and rollback verification are still open.',
    ],
    followup: [
      'LOTUS release notes draft',
      'The release date is intentionally omitted until QA closes. Do not infer readiness from merged code alone.',
    ],
    owner: 'Alex maintains the release branch.',
    collaborators: 'Two reviewers and the QA bot gate merges.',
    timeline: 'Release candidate review is October 10.',
    status: 'PR #42 is open with two required checks pending.',
    access: 'Security advisories are private to maintainers.',
    risk: 'The latest preview uses stale environment configuration.',
    metric: '12 commits · 8 checks passed · 2 pending.',
    next: 'Resolve the accessibility review before requesting merge.',
  },
  outlook: {
    primary: [
      'Launch readiness thread',
      'Mai asked each owner to confirm blockers before the October 10 review.',
    ],
    followup: [
      'Draft meeting recap',
      'The recap is saved as a draft and must not be sent until attendees verify the decisions.',
    ],
    owner: 'Mai owns the readiness thread.',
    collaborators: 'Alex, Linh, and An are active participants.',
    timeline: 'Responses are due October 9 at 17:00 UTC.',
    status: 'Two of four owners have confirmed readiness.',
    access: 'The executive summary is internal only.',
    risk: 'One forwarded message contains an outdated budget.',
    metric: '7 messages · 2 confirmations · 2 outstanding.',
    next: 'Follow up with the remaining owners without sending the draft recap.',
  },
  discord: {
    primary: [
      '#launch-lab',
      'Facilitator: Test the support bot here before sharing any response outside the practice server.',
    ],
    followup: [
      'Customer role feedback',
      'Three testers found the early-access answer unclear; no customer data was shared.',
    ],
    owner: 'An moderates the practice server.',
    collaborators: 'Support trainees and facilitators can post test prompts.',
    timeline: 'Practice closes October 9 at 15:00 UTC.',
    status: 'Six scenarios completed; two need a retry.',
    access: 'Bots may read practice channels only.',
    risk: 'A copied production webhook must never be used in practice.',
    metric: '14 participants · 6 passes · 2 retries.',
    next: 'Retry the ambiguous early-access scenario with clearer guardrails.',
  },
  linear: {
    primary: [
      'LOT-118 · Finalize release criteria',
      'In progress · Owner: Alex · Priority: urgent · Two acceptance items remain.',
    ],
    followup: [
      'LOT-121 · Confirm customer segment',
      'Blocked · Owner: Mai · Waiting for marketing operations review.',
    ],
    owner: 'Alex owns the launch project.',
    collaborators: 'Product, engineering, and support share the project.',
    timeline: 'Cycle ends October 10.',
    status: '21 completed · 5 active · 2 blocked.',
    access: 'Private product research is linked but not shared.',
    risk: 'LOT-119 depends on an unverified analytics event.',
    metric: '75% cycle progress · 3 urgent issues.',
    next: 'Clarify acceptance criteria on LOT-118.',
  },
  asana: {
    primary: [
      'Project Lotus launch plan',
      'Milestone: launch approval. Owner: Mai. Due October 10.',
    ],
    followup: [
      'Prepare support playbook',
      'Owner: An. Draft complete; review and training remain.',
    ],
    owner: 'Mai coordinates the launch portfolio.',
    collaborators: 'Seven teammates have assigned tasks.',
    timeline: 'Final milestone review is October 10.',
    status: '23 complete · 6 upcoming · 3 overdue.',
    access: 'The customer escalation plan is restricted.',
    risk: 'Three overdue tasks may block support readiness.',
    metric: '72% complete · 3 overdue · 4 approvals.',
    next: 'Reassign or reschedule overdue support tasks.',
  },
  clickup: {
    primary: [
      'Launch operations list',
      'The launch checklist is grouped by owner and approval state.',
    ],
    followup: [
      'Localization review',
      'Vietnamese copy is in review with two unresolved comments.',
    ],
    owner: 'Linh owns communications operations.',
    collaborators: 'Marketing and support review every customer-facing task.',
    timeline: 'Content freeze is October 10 at 12:00 UTC.',
    status: '31 of 40 subtasks are complete.',
    access: 'Agency guests see only assigned localization tasks.',
    risk: 'The automated due date differs from the approved plan.',
    metric: '40 subtasks · 31 complete · 2 blocked.',
    next: 'Resolve the localization comments before content freeze.',
  },
  airtable: {
    primary: [
      'Launch content inventory',
      'Every asset includes an owner, locale, approval state, and destination.',
    ],
    followup: [
      'Audience segments view',
      'Existing customers are approved. Prospects and partners remain excluded.',
    ],
    owner: 'Linh maintains the content base.',
    collaborators: 'Mai approves records through the review view.',
    timeline: 'Final records are due October 10.',
    status: '18 approved · 7 drafting · 3 blocked.',
    access: 'Personal customer fields are hidden from the campaign view.',
    risk: 'Two records have no accountable owner.',
    metric: '28 assets · 64% approved · 2 missing owners.',
    next: 'Assign owners and filter the publish queue to approved records.',
  },
  dropbox: {
    primary: [
      'Project Lotus shared folder',
      'Approved creative assets are separated from working files and archive material.',
    ],
    followup: [
      'Final logos',
      'The SVG and PNG logo packages were approved by Mai on October 8.',
    ],
    owner: 'Linh owns the shared campaign folder.',
    collaborators: 'Designers can edit working files; reviewers can comment.',
    timeline: 'Asset freeze is October 10 at 12:00 UTC.',
    status: '9 final assets · 6 working files · 4 archived versions.',
    access: 'Public links are disabled for the launch folder.',
    risk: 'An old logo package is still starred by two collaborators.',
    metric: '19 files · 2.4 GB · last synced 12 minutes ago.',
    next: 'Unstar the obsolete package and confirm the final folder.',
  },
  hubspot: {
    primary: [
      'Project Lotus campaign',
      'Audience: existing customers. Status: preparing. Owner: Linh.',
    ],
    followup: [
      'Approval workflow',
      'Marketing email requires Mai’s approval and a completed QA checklist.',
    ],
    owner: 'Linh owns the campaign.',
    collaborators: 'Mai approves; An monitors customer responses.',
    timeline: 'Tentative send window is October 12.',
    status: 'Campaign is not scheduled; approval is pending.',
    access:
      'Contact properties cannot be exported from this practice workflow.',
    risk: 'A draft list includes 84 unapproved prospects.',
    metric: '2,480 approved recipients · 84 excluded prospects.',
    next: 'Remove the prospect segment and request approval.',
  },
  salesforce: {
    primary: [
      'Lotus customer launch view',
      'The approved view contains active customers with launch communication consent.',
    ],
    followup: [
      'Escalation case 0194',
      'Customer asked about early access; product confirmation is still pending.',
    ],
    owner: 'An owns customer readiness.',
    collaborators: 'Account owners validate consent and account status.',
    timeline: 'Record review finishes October 10.',
    status: '92% of eligible accounts are verified.',
    access: 'Only aggregated counts may leave the customer workspace.',
    risk: 'Six accounts have missing communication consent.',
    metric: '2,480 eligible · 2,282 verified · 6 consent gaps.',
    next: 'Route consent gaps to account owners; do not infer permission.',
  },
  figma: {
    primary: [
      'Project Lotus launch kit',
      'Cover, email header, social cards, and support graphics are grouped by approval status.',
    ],
    followup: [
      'Email header · v7',
      'Ready for review. The date layer is hidden until launch readiness is approved.',
    ],
    owner: 'Vy owns the design file.',
    collaborators: 'Linh comments on copy; Mai gives final approval.',
    timeline: 'Design freeze is October 10 at 12:00 UTC.',
    status: '11 frames approved · 4 in review · 2 drafts.',
    access: 'External viewers can access exports only after approval.',
    risk: 'One social frame uses the unapproved partner audience.',
    metric: '17 frames · 9 comments open · 3 reviewers.',
    next: 'Update the social audience and resolve review comments.',
  },
  confluence: {
    primary: [
      'Project Lotus runbook',
      'The runbook covers readiness, communication, rollback, and customer support ownership.',
    ],
    followup: [
      'Launch decision log',
      'No go-live decision is recorded yet. The next decision point is after QA review.',
    ],
    owner: 'Mai owns the runbook.',
    collaborators: 'Each workstream lead maintains its section.',
    timeline: 'Runbook sign-off is October 10 at 15:00 UTC.',
    status: 'Five sections verified; support escalation needs review.',
    access: 'Incident procedures are internal.',
    risk: 'The rollback contact list was last verified three months ago.',
    metric: '8 sections · 5 verified · 6 open comments.',
    next: 'Verify rollback contacts and the support escalation path.',
  },
  zoom: {
    primary: [
      'Launch readiness review',
      'October 10, 09:00 UTC · 30 minutes · Mai hosts · recording off by default.',
    ],
    followup: [
      'Support practice room',
      'October 9, 14:00 UTC · 45 minutes · An hosts · practice data only.',
    ],
    owner: 'Mai hosts the readiness review.',
    collaborators: 'Alex, Linh, and An are required participants.',
    timeline: 'The room opens five minutes before each session.',
    status: 'Invitations sent; two attendees have not responded.',
    access: 'Recording requires explicit participant consent.',
    risk: 'Auto-recording is enabled in an old meeting template.',
    metric: '2 sessions · 7 invitees · 5 accepted.',
    next: 'Disable auto-recording and follow up with missing attendees.',
  },
};

export const mockApps: MockApp[] = mockAppCatalog.map(({ id }) => id);

export function seedRecords(): MockRecord[] {
  return mockAppCatalog.flatMap(({ id: app }) => {
    const profile = profiles[app];
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
