import assert from 'node:assert/strict';

export async function verifyTeamConcurrency(request, owner) {
  const created = await request('/rooms', owner, {
    title: 'Concurrent teams regression',
    startsAt: null,
    endsAt: null,
    maxUsers: 12,
    teamCount: 4,
  });
  assert.equal(created.status, 201, await created.clone().text());
  const room = await created.json();
  const path = `/rooms/${room.id}`;
  for (const team of room.teams) {
    const saved = await request(`${path}/action`, owner, {
      action: 'prompt',
      teamId: team.id,
      revision: 0,
      prompt:
        'Prepare a RISE invitation using approved sources and human review.',
    });
    assert.equal(saved.status, 200);
  }
  // The fixture delays compilation, so these four jobs overlap in the DO.
  const pending = room.teams.map((team) =>
    request(`${path}/ai`, owner, {
      action: 'compile',
      teamId: team.id,
      multiple: false,
    })
  );
  await new Promise((resolve) => setTimeout(resolve, 300));
  const duplicate = await request(`${path}/ai`, owner, {
    action: 'compile',
    teamId: room.teams[3].id,
    multiple: false,
  });
  assert.equal(duplicate.status, 409);
  assert.match(await duplicate.text(), /ai_busy/);
  for (const response of await Promise.all(pending)) {
    assert.equal(response.status, 200, await response.clone().text());
  }
  const final = await (await request(path, owner)).json();
  assert.equal(final.aiCalls, 4);
  assert.ok(
    final.teams.every((team) => team.skills.length > 0 && team.aiCalls === 1)
  );
  const retry = await request(`${path}/ai`, owner, {
    action: 'compile',
    teamId: room.teams[3].id,
    multiple: false,
  });
  assert.equal(retry.status, 200, await retry.clone().text());
  console.log(
    'Four concurrent teams, duplicate protection, counters and lock release passed'
  );
}
