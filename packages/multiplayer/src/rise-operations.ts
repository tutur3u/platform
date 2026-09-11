import type { MockApp, MockRecord } from './mock-catalog';

/** Fictional, linked operational evidence for club and study workflows. */
const operations: Record<MockApp, [string, string, string, string]> = {
  drive: [
    'Event run sheet',
    'Rehearsal: 14:00 welcome; 14:15 four department introductions; 14:40 mini idea challenge; 15:25 student demos; 16:00 questions; 16:30 close. Use rise-induction-brief v2 for logistics, never the old calendar proposal.',
    'Research reading pack',
    'For each provided reading, capture its central claim, supporting evidence, limitations, and two questions. Reference page numbers from the actual reading; do not invent citations.',
  ],
  notion: [
    'Post production workflow',
    '1. Read drive/rise-induction-brief. 2. Check teams/rise-induction-pathways and gmail/rise-induction-partners. 3. Follow rise-induction-brand. 4. Draft captions and artwork. 5. Complete trello/rise-induction-approval. Ask the event lead to replace rehearsal details before publishing.',
    'System prompt worksheet',
    'Role: club communications assistant. Context: newcomer audience. Sources: approved brief over stale chat. Task: bilingual invitation. Format: captions, sources, artwork, checklist. Boundaries: no invented claims, no direct publication.',
  ],
  zalo: [
    'Volunteer handover',
    'Practice chat: welcome volunteers need an arrival checklist, a short Vietnamese greeting, and a route for questions they cannot answer. Do not ask volunteers to collect sensitive personal information.',
    'Capacity check-in draft',
    'Practice message: I can help with one caption review this week, but have an assessment deadline. Could someone else own the artwork review? People & Culture should help rebalance work, not disclose personal reasons.',
  ],
  messenger: [
    'Newcomer reply library',
    'Draft answers to: Can first-year students join? Do I need a business background? Can I explore more than one department? Keep replies welcoming, explain learning opportunities, and direct eligibility questions to the confirmed registration guide.',
    'Accessible participation question',
    'An anonymized practice enquiry asks about a quieter way to participate. Draft a considerate reply offering a small-group conversation; ask the event lead to confirm available accommodations before promising them.',
  ],
  teams: [
    'Decision log: announcement scope',
    'All four departments agreed to one shared Induction Day invitation. Marketing owns copy, Product verifies the activity flow, External Relations checks partner claims, People & Culture checks welcome and accessibility. The event lead confirms logistics.',
    'Weekly stand-up template',
    'Each department reports one outcome, evidence, a blocker, an owner, and a next checkpoint. AI may summarize discussion and suggest tasks; participants confirm decisions before those tasks are treated as commitments.',
  ],
  calendar: [
    'Rehearsal review checkpoints',
    'Relative deadlines: event lead confirms logistics seven days before publication; departments review copy five days before; bilingual and accessibility review three days before; page admin performs final check on publication day. Do not create real meetings.',
    'Study-first planning',
    'Example capacity: classes Monday and Wednesday mornings; assessment due Friday; club work Tuesday afternoon. Propose focused work blocks and a buffer, then ask the student to confirm their actual schedule.',
  ],
  jira: [
    'RISE-51: Accessible registration flow',
    'Acceptance criteria: readable labels, keyboard navigation, clear validation, mobile layout, minimal data collection, and a confirmation message with next steps. Owner: Product & Development. Status: review needed.',
    'RISE-52: Evidence-backed caption',
    'Definition of done: two equivalent language versions; confirmed logistics; no unapproved speakers; explicit CTA; sources and unresolved questions kept outside the caption. Link to drive/rise-induction-brief and trello/rise-induction-approval.',
  ],
  trello: [
    'Caption review queue',
    'To draft → department review → bilingual check → event-lead fact check → page-admin approval. Moving a practice card does not authorize real Facebook publication. Store feedback next to the draft it refers to.',
    'Artwork review card',
    'Check hierarchy, contrast, mobile legibility, logo permission, image rights, and alt text. AI-generated concepts must be reviewed for distorted text and misleading depictions of people or events.',
  ],
  gmail: [
    'Draft partner enquiry',
    'Subject: Exploring a learning-focused collaboration with RISE. Introduce the shared purpose, ask whether a conversation would be useful, and offer a concise outline. Do not imply the recipient is already a sponsor or promise benefits that have not been approved.',
    'Event lead fact-check request',
    'Draft a short request for the real date, time zone, room, registration link, eligibility, and approval owner. Explain that the evidence pack currently contains rehearsal placeholders. Do not send it automatically.',
  ],
  slack: [
    'Study circle notes',
    'Practice group wants explanations of difficult concepts, retrieval questions, and a revision plan. AI should ask what the learner understands, explain one step at a time, and check understanding instead of completing assessed work.',
    'Campaign risk review',
    'Three open risks: the placeholder registration URL, old calendar timing, and an unapproved keynote mention. Resolve using approved sources or ask for confirmation. Keep open issues visible in the handover.',
  ],
  sheets: [
    'Draft comparison scorecard',
    'Columns: version, factual accuracy, newcomer clarity, bilingual equivalence, accessibility, CTA, reviewer notes. Score only after reviewing actual outputs. Do not manufacture attendance or conversion statistics.',
    'Capacity allocation exercise',
    'Fictional weekly availability: Marketing 6 hours, Product 5, External Relations 3, People & Culture 4. Tasks: caption 2h, artwork 3h, logistics check 1h, welcome guide 2h, review 2h. Propose owners with a buffer; these are exercise estimates, not member commitments.',
  ],
  github: [
    'Registration prototype README',
    'Purpose: a student prototype for exploring a simpler event sign-up flow. Never place real student details or credentials in issues. Document setup, assumptions, accessibility checks, and known limitations.',
    'Issue: confirmation copy',
    'Propose a friendly success message, an actionable invalid-link error, and a next-step reminder. Test keyboard focus and mobile wrapping. Keep event time and venue sourced from the current approved brief.',
  ],
  outlook: [
    'Campus coordination draft',
    'Prepare an enquiry about room availability and accessibility needs. A calendar slot is not a confirmed booking. Ask for written confirmation before Marketing uses venue details in a real announcement.',
    'Meeting follow-up outline',
    'Summarize confirmed decisions separately from proposals. List each action, owner, and proposed due date. Ask recipients to correct the summary before it becomes the shared record.',
  ],
  discord: [
    'Peer learning channel',
    'Members can share a concept they are studying, what they tried, and a specific question. Ask AI for hints, examples, and practice questions. Do not post private coursework or another student’s answers without permission.',
    'Prompt clinic challenge',
    'Compare “write a great post” with a prompt specifying role, audience, verified sources, tone, format, and approval boundaries. Test both against the same missing-link scenario and explain which is easier to evaluate.',
  ],
  linear: [
    'Discovery task: first-time attendee',
    'Synthesize anonymized questions from Messenger into needs: belonging, clarity, low-pressure participation, and practical learning. Separate observations from assumptions; propose a small test for each assumption.',
    'Release blocker: placeholder URL',
    'Block any ready-to-publish label while example.com remains in the caption. Ask a club member to supply and open the real registration URL. The assistant cannot verify live links through practice tools.',
  ],
  asana: [
    'Induction responsibility map',
    'Marketing: bilingual copy and creative direction. Product: experience and activity instructions. External Relations: approved partner statements. People & Culture: welcome, volunteer support, and accessibility. Event lead: final logistics.',
    'Post-event reflection plan',
    'After a real event, collect consent-safe feedback, summarize themes without identifying students, compare observations with goals, and suggest one improvement per department. Do not invent feedback before collecting it.',
  ],
  clickup: [
    'Content sprint checklist',
    'Gather evidence, draft two hooks, compare clarity, write captions, prepare artwork brief and alt text, verify facts, request review. Use explicit draft status so teammates know what is still changeable.',
    'Assessment planning helper',
    'Break a rubric into requirements and checkpoints, plan research and revision time, and generate self-check questions. Ask the student for their course AI rules before suggesting a workflow.',
  ],
  airtable: [
    'Volunteer skills matrix',
    'Fictional roles, not personal records: welcome host, activity facilitator, copy reviewer, accessibility reviewer, demo helper. Match opted-in interests and confirmed availability; let people decline assignments.',
    'Knowledge source register',
    'Fields: source ID, owner department, version, approval status, supersedes, unresolved questions. Highest priority: approved event brief v2. Public club links establish identity, not the date of the next event.',
  ],
  dropbox: [
    'Creative asset manifest',
    'Folders: approved identity, working concepts, reviewed exports, archived drafts. Do not use an image just because it is in a shared folder: confirm rights, approval status, and suitability for the specific announcement.',
    'Export handover guide',
    'Provide editable source, a mobile-friendly feed export, plain-text captions, descriptive alt text, and a note listing remaining approvals. Check that image text matches the caption and confirmed brief.',
  ],
  hubspot: [
    'Newcomer journey draft',
    'Awareness → questions → confirmed registration → welcome → department exploration → follow-up. Offer useful information at each step. Keep outreach opt-in and avoid treating a public comment as permission for bulk messages.',
    'Partner follow-up criteria',
    'Prioritize shared educational purpose, relevance to students, and relationship-owner approval. Draft a specific next step; never fabricate previous conversations or imply a partnership has been agreed.',
  ],
  salesforce: [
    'Collaboration qualification notes',
    'Practice fields: shared purpose, student benefit, contact owner, evidence of interest, open questions, approval stage. Budget and speaker availability remain unknown until confirmed in writing.',
    'Claims approval matrix',
    'Mentioning a partner name, logo, keynote, prize, or funding requires explicit authorization. If evidence is missing, remove the claim and ask External Relations to verify it.',
  ],
  figma: [
    'Artwork prompt starter',
    'Create a welcoming student innovation concept with four abstract pathways converging around collaboration. Avoid real faces, invented sponsor logos, and embedded event logistics. Leave clear space for a designer to add approved title and details.',
    'Visual quality checklist',
    'Review contrast, spacing, mobile legibility, bilingual text length, image rights, and alt text. Generated artwork is a concept requiring human review; never describe it as a photograph of an event that occurred.',
  ],
  confluence: [
    'Source priority and conflict policy',
    'Prefer the latest approved event brief over old calendar proposals, casual chat, and unreviewed drafts. Note which source supersedes another. If two current approved sources conflict, ask their owners rather than combining incompatible facts.',
    'Reusable skill design',
    'A good skill states when to use it, required inputs, steps, output format, and safeguards. Example: bilingual caption review checks factual consistency, natural language, one CTA, and missing approvals.',
  ],
  zoom: [
    'Rehearsal facilitation plan',
    'Give each department a short slot to explain its prompt, show its skills, run the same scenario, and reflect on evidence and mistakes. Keep feedback about the system, not the person. Ask before recording.',
    'Meeting recap practice',
    'Separate decisions, open questions, and proposed actions. Include owners only when confirmed. Ask speakers to check meaning before sharing a recap; anonymize sensitive comments and respect recording consent.',
  ],
};

export const riseOperationRecords: MockRecord[] = Object.entries(
  operations
).flatMap(([app, entries]) =>
  [0, 2].map((index) => ({
    id: `rise-operations-${app}-${index / 2 + 1}`,
    app: app as MockApp,
    title: entries[index]!,
    content: entries[index + 1]!,
  }))
);
