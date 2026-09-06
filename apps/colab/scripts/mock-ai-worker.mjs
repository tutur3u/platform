import { WorkerEntrypoint } from 'cloudflare:workers';

/** Deterministic local-only AI fixture: exercises the real room AI/broadcast path. */
export default class MockAI extends WorkerEntrypoint {
  async run(_model, options) {
    const system = options.messages[0].content;
    const input = JSON.parse(options.messages[1].content);
    let result;
    if (system.startsWith('Convert')) {
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
    } else if (system.startsWith('Coach')) {
      result = { feedback: 'Demo coaching: check approvals.' };
    } else if (!input.previousActions.length) {
      result = {
        tool: 'create',
        app: 'drive',
        title: 'Live demo document',
        content: 'A controlled demo output.',
      };
    } else {
      result = { answer: 'Live demo agent result' };
    }
    return { response: JSON.stringify(result) };
  }
}
