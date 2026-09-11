import { WorkerEntrypoint } from 'cloudflare:workers';

/** Deterministic local-only AI fixture: exercises the real room AI/broadcast path. */
export default class MockAI extends WorkerEntrypoint {
  async run(_model, options) {
    const system = options.messages[0].content;
    const input = JSON.parse(options.messages[1].content);
    let result;
    if (system.startsWith('Convert')) {
      if (input.prompt.includes('[always-malformed]'))
        return { response: 'The response could not be completed.' };
      if (
        input.prompt.includes('[malformed-once]') &&
        !system.includes('previous response was incomplete')
      )
        return { response: 'The response could not be completed.' };
      await new Promise((resolve) => setTimeout(resolve, 3000));
      result = {
        skills: [
          {
            name: 'demo-skill',
            description: 'Demo skill',
            body: '# Demo skill\nRead the launch brief and ask for approval.',
          },
        ],
      };
    } else if (system.startsWith('Design')) {
      result = {
        title: 'Induction Day: registration link missing',
        brief:
          'Prepare the RISE invitation, but the registration link is missing. Ask the event lead to confirm it before calling the post ready.',
        criteria: [
          'Checks the approved event brief',
          'Flags the missing link',
          'Keeps publishing under human review',
        ],
      };
    } else if (system.includes('Analyze the supplied prompt')) {
      const framework = system.includes('framework craft:')
        ? ['context', 'role', 'action', 'format', 'tone']
        : ['role', 'inputs', 'steps', 'output'];
      result = {
        summary:
          'Your assistant has a clear starting point. Add an explicit source and review rule.',
        sections: framework.map((id) => ({
          id,
          quote: input.prompt.slice(0, 100),
          explanation: 'This instruction helps define the assistant’s work.',
          improvement:
            'Check the approved Induction Day brief before drafting, and ask about missing facts.',
        })),
      };
    } else if (system.startsWith('Coach')) {
      result = { feedback: 'Demo coaching: check approvals.' };
    } else if (!input.previousActions.length) {
      result = {
        tool: 'drive.create',
        app: 'drive',
        title: 'Live demo document',
        content: 'A controlled demo output.',
      };
    } else {
      result = {
        answer: {
          english_caption: 'Live demo agent result',
          vietnamese_caption:
            'Bản nháp RISE: cần thành viên duyệt trước khi đăng.',
          source_notes: ['Controlled practice data'],
          readiness_checklist: { approval: 'Required before publishing' },
        },
      };
    }
    return { response: JSON.stringify(result) };
  }
}
