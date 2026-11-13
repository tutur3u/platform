let studioCalls = 0;

/** Deterministic AI Studio stand-in for the local Colab runtime harness. */
export async function studioResponse(request) {
  const url = new URL(request.url);
  if (
    `${url.origin}${url.pathname}` !==
    'https://ai.tuturuuu.com/v1/colab/responses'
  )
    return null;
  const body = JSON.parse(await request.text());
  studioCalls += 1;
  const headers = {
    'x-colab-sponsor-workspace': '00000000-0000-0000-0000-000000000000',
  };
  const receipt = {
    id: `request-${studioCalls}`,
    tuturuuu: {
      run_id: `run-${studioCalls}`,
      billing: { billedCredits: 1 },
    },
  };
  if (body.sponsorship?.phase === 'image_generation')
    return Response.json(
      { ...receipt, data: [{ b64_json: 'AAAA', media_type: 'image/png' }] },
      { headers }
    );
  const system = String(body.instructions ?? '');
  const input = JSON.parse(String(body.prompt ?? '{}'));
  const prompt = String(input.prompt ?? '');
  let content;
  if (system.startsWith('Convert')) {
    if (prompt.includes('[always-malformed]'))
      content = 'The response could not be completed.';
    else if (
      prompt.includes('[malformed-once]') &&
      !system.includes('previous response was incomplete')
    )
      content = 'The response could not be completed.';
    else {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      content = JSON.stringify({
        skills: [
          {
            name: 'demo-skill',
            description: 'Demo skill',
            body: '# Demo skill\nRead the launch brief and ask for approval.',
          },
        ],
      });
    }
  } else if (system.startsWith('Design')) {
    content = JSON.stringify({
      title: 'Induction Day: registration link missing',
      brief:
        'Prepare the RISE invitation, but the registration link is missing. Ask the event lead to confirm it before calling the post ready.',
      criteria: [
        'Checks the approved event brief',
        'Flags the missing link',
        'Keeps publishing under human review',
      ],
    });
  } else if (system.includes('Analyze the supplied prompt')) {
    const framework = system.includes('framework craft:')
      ? ['context', 'role', 'action', 'format', 'tone']
      : ['role', 'inputs', 'steps', 'output'];
    content = JSON.stringify({
      summary:
        'Your assistant has a clear starting point. Add an explicit source and review rule.',
      sections: framework.map((id) => ({
        id,
        quote: prompt.slice(0, 100),
        explanation: 'This instruction helps define the assistant’s work.',
        improvement:
          'Check the approved Induction Day brief before drafting, and ask about missing facts.',
      })),
    });
  } else if (system.startsWith('Coach'))
    content = JSON.stringify({ feedback: 'Demo coaching: check approvals.' });
  else if (!input.previousActions?.length) {
    content = JSON.stringify({
      tool: 'drive.create',
      app: 'drive',
      title: 'Live demo document',
      content: 'A controlled demo output.',
    });
  } else {
    content = JSON.stringify({
      answer: {
        english_caption: 'Live demo agent result',
        vietnamese_caption:
          'Bản nháp RISE: cần thành viên duyệt trước khi đăng.',
        source_notes: ['Controlled practice data'],
        readiness_checklist: { approval: 'Required before publishing' },
      },
    });
  }
  return Response.json(
    { ...receipt, choices: [{ message: { content } }] },
    { headers }
  );
}
