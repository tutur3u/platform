import type { Scenario } from './index';
import { riseInductionScenario } from './rise-induction';
export function starterScenarios(): Scenario[] {
  return [
    structuredClone(riseInductionScenario),
    {
      id: 'rise-pathways',
      title: 'Find your place at RISE',
      brief:
        'Help RISE introduce its four pathways to innovation: Marketing & Growth, Product & Development, External Relations, and People & Culture. Use the practice apps to turn the bilingual campaign brief into a clear recruitment plan without inventing dates, approvals, or student information.',
      criteria: [
        'Adapts the message to each RISE department and audience',
        'Separates verified facts from assumptions or missing details',
        'Drafts useful next steps and asks for approval before publishing',
      ],
    },
    {
      id: 'rise-induction-day',
      title: 'Induction Day, without the busywork',
      brief:
        'Coordinate RISE Induction Day and the Start Up Showcase across the four departments. Review calendars, task boards, registrations, and venue notes; then propose owners, a run sheet, and two conflict-free check-in options.',
      criteria: [
        'Checks availability and unresolved dependencies',
        'Assigns work to the most relevant department',
        'Proposes a realistic plan without scheduling anything automatically',
      ],
    },
    {
      id: 'rise-study-workflow',
      title: 'Study smarter, contribute better',
      brief:
        'Create a weekly plan for a RISE member balancing classes, a group assignment, and club responsibilities. Summarize course notes, identify deadlines, break work into focused tasks, and draft a respectful message when priorities conflict.',
      criteria: [
        'Uses course and club records without exposing personal information',
        'Prioritizes by deadline, effort, and team impact',
        'Keeps the student in control of messages and final submissions',
      ],
    },
    {
      id: 'rise-partnership-outreach',
      title: 'Partnership outreach with purpose',
      brief:
        'Support External Relations in researching a potential ecosystem partner and drafting a concise outreach note. Connect the partnership to RISE’s mission of sustainable, real-world impact while clearly marking facts that still need verification.',
      criteria: [
        'Connects the partner opportunity to a concrete RISE initiative',
        'Flags unverified claims and missing contact context',
        'Produces a personalized draft for human review rather than sending it',
      ],
    },
  ];
}
