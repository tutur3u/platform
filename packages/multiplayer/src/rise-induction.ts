import type { Scenario } from './index';
import type { MockRecord } from './mock-catalog';

export const riseInductionScenario: Scenario = {
  id: 'rise-induction-post',
  title: 'From club knowledge to a Facebook-ready Induction Day post',
  brief:
    'Your team is building an AI communications assistant for RISE Club. Write a reusable system prompt, generate its skills, and test it against the Induction Day evidence pack. The final deliverable is an engaging English and Vietnamese Facebook post for https://www.facebook.com/RISEClubSGS, plus an artwork brief, alt text, source notes, and a publishing checklist. Gather knowledge from event documents, updated calendar notes, member questions, department conversations, brand guidance, and approval records. Resolve outdated information before drafting. The event pack contains fictional rehearsal details: a real post needs the club’s confirmed date, venue, registration URL, and final approval. Colab prepares the work; a club member publishes it.',
  criteria: [
    'Builds reusable instructions: role, audience, source priorities, workflow, output format, and review rules',
    'Checks the latest event facts and resolves the old calendar proposal using the approved event brief',
    'Writes a welcoming hook, concrete reasons to attend, accurate logistics, and one clear registration call to action in English and Vietnamese',
    'Introduces the four RISE departments with benefits a first-time member can understand; invents no speakers, sponsors, promises, or testimonials',
    'Separates copy-ready post text from evidence notes, artwork direction, alt text, and any unresolved questions',
    'Marks rehearsal details and checks real event facts, links, and a named reviewer before calling the post ready for Facebook',
  ],
};

/** Additive IDs preserve edits and legacy app records in existing rooms. */
export const riseInductionRecords: MockRecord[] = [
  {
    id: 'rise-induction-brief',
    app: 'drive',
    title: 'Induction Day · approved rehearsal event brief · v2',
    content:
      'FICTIONAL REHEARSAL DATA, not a real event announcement. Approved within this exercise by the event lead. Event: RISE Club Induction Day & Start Up Showcase. Saturday 17 October 2026, 14:00–16:30, Vietnam time (UTC+7). Venue: RMIT Saigon South, practice room A. Register: https://example.com/rise-induction (placeholder, never publish as a real registration link). Free entry for RMIT students curious about entrepreneurship; no startup experience needed. Meet members, explore four departments, try a mini idea challenge, and watch student project demos. Bring curiosity and a phone for the activity. This v2 brief supersedes the Thursday calendar proposal. Real publishing requires replacing all rehearsal logistics and the placeholder URL.',
  },
  {
    id: 'rise-induction-brand',
    app: 'notion',
    title: 'RISE voice · welcoming, concrete, bilingual',
    content:
      'Marketing & Growth voice guide: speak student-to-student; optimistic and warm, with clear benefits rather than hype. Theme: Find Your Place. Build Your Impact. A newcomer should feel welcome without needing business experience. English first, then a complete natural Vietnamese version. Keep each language around 120–180 words, use short paragraphs and a single registration CTA. Mention Marketing & Growth, Product & Development, External Relations, and People & Culture with a short benefit each. Avoid decorative Unicode fonts; Facebook does not reliably render Markdown headings or bold markers. Use plain copy for the final caption.',
  },
  {
    id: 'rise-induction-logistics',
    app: 'calendar',
    title: 'Induction Day · outdated calendar proposal',
    content:
      'SUPERSEDED proposal: Thursday 13:00–17:00, venue pending. Do not use this proposal in the post. Product & Development confirmed that drive / rise-induction-brief v2 is the source of truth for rehearsal logistics. If two approved sources conflict, ask the event lead instead of guessing.',
  },
  {
    id: 'rise-induction-questions',
    app: 'messenger',
    title: 'Newcomer listening notes · anonymized questions',
    content:
      'Composite practice questions from prospective members: “Do I need a startup idea already?” “Can I join if I am quiet or new to university?” “Will I get to try something, or just listen?” People & Culture approved the answers: no previous startup experience needed; there are opportunities to meet people in small groups; the induction includes a mini idea challenge. Do not quote these as real student testimonials or include names.',
  },
  {
    id: 'rise-induction-pathways',
    app: 'teams',
    title: 'Four departments · one Induction Day story',
    content:
      'Marketing & Growth: learn storytelling and community building. Product & Development: turn a problem into a useful experience and test an idea. External Relations: build meaningful connections with the wider innovation community. People & Culture: help members feel supported, find their strengths, and work well together. Department leads want one united invitation, not four competing posts. Do not promise internships, jobs, certificates, funding, or exclusive access.',
  },
  {
    id: 'rise-induction-partners',
    app: 'gmail',
    title: 'External Relations · partner claims review',
    content:
      'No external speaker or sponsor is approved for the rehearsal announcement. Refer to student project demos only. An earlier draft mentioned an industry keynote; remove that claim. Real partner names and logos require written confirmation and permission before publishing.',
  },
  {
    id: 'rise-induction-art',
    app: 'figma',
    title: 'Induction Day · artwork and accessibility brief',
    content:
      'Create a 4:5 feed graphic concept: RISE identity, Induction Day title, four pathways converging around student collaboration, and a clearly readable event-details block. Use club-approved assets. Avoid identifiable student photos without consent. Supply descriptive alt text explaining the image and any essential text. Keep the registration URL in the caption too; do not rely on a QR code alone. This task asks for an artwork brief, not a claim that an image has been generated.',
  },
  {
    id: 'rise-induction-approval',
    app: 'trello',
    title: 'Ready for Facebook · release checklist',
    content:
      'Review owner: Marketing & Growth lead, with event facts checked by the event lead and tone/accessibility checked by People & Culture. Checklist: confirm real date/time/timezone/venue; open the real registration URL and check eligibility; remove rehearsal facts and example.com; compare English/Vietnamese meaning; verify department names; remove unapproved speakers/sponsors; review artwork rights and alt text; check on a phone; get final approval. Destination https://www.facebook.com/RISEClubSGS. Colab has no Facebook publishing tool: prepare the final caption and hand it to a page admin.',
  },
  {
    id: 'rise-induction-source',
    app: 'confluence',
    title: 'RISE public identity · source register',
    content:
      'Public reference: https://www.rmit.edu.vn/students/campus-life/clubs/saigon-south-campus-clubs/academic-clubs/innovation-social-entrepreneurship . RMIT describes a Saigon South club empowering young people interested in entrepreneurship, sustainable solutions, and real-world impact. Page: https://www.facebook.com/RISEClubSGS . These links support club identity, not event logistics. The app tools read this curated practice library; they do not browse the live websites. Ask a member to verify current public content when needed.',
  },
  {
    id: 'rise-induction-retro',
    app: 'sheets',
    title: 'Content review worksheet · quality over invented metrics',
    content:
      'Evaluate each draft from 1 to 5 on factual accuracy, newcomer clarity, bilingual consistency, accessibility, and strength of the next step. No attendance numbers, conversion rates, or past-event results are supplied; never invent them. Test the same prompt after a venue change or a missing registration link and see whether the assistant asks for the right clarification.',
  },
];
