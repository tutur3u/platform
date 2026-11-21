/** Tests for the EduFest workshop's interactive demos (run via src/roadmap-data.test.ts). */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import en from '../../../messages/edufest-2026.en.json' with { type: 'json' };
import vi from '../../../messages/edufest-2026.vi.json' with { type: 'json' };
import { readStyles } from '../../style-source.ts';
import { cssDeclarations } from '../../css-guards.ts';
import {
  AGENDA_SEATS,
  AGENT_STEPS,
  ASK_MODES,
  ASK_QUESTIONS,
  answerVisible,
  BOOTHS,
  HUMAN_STEPS,
  LIVE_TABS,
  QUIZ_ANSWER,
  QUIZ_OPTIONS,
  QUIZ_START,
  QUIZ_TEAM_PICKS,
  type QuizState,
  quizReducer,
  VOTE_START,
  voteReducer,
  WORKSHOP_ASK_MODE,
} from './edufest-2026-demos.ts';
import { AGENDA } from './edufest-2026.ts';

const source = (file: string) =>
  readFileSync(
    new URL(`../../components/workshop/${file}`, import.meta.url),
    'utf8'
  );

describe('EduFest demos: the team quiz keeps answers hidden until the reveal', () => {
  it('walks picking, locked and revealed, in that order only', () => {
    let state: QuizState = QUIZ_START;
    // Locking without a pick does nothing; revealing early does nothing.
    assert.deepEqual(quizReducer(state, { type: 'lock' }), QUIZ_START);
    assert.deepEqual(quizReducer(state, { type: 'reveal' }), QUIZ_START);
    state = quizReducer(state, { type: 'pick', option: '3' });
    state = quizReducer(state, { type: 'pick', option: '4' });
    assert.deepEqual(state, { phase: 'picking', pick: '4' });
    state = quizReducer(state, { type: 'lock' });
    assert.equal(answerVisible(state), false, 'hidden while locked');
    // A locked pick cannot change.
    assert.equal(quizReducer(state, { type: 'pick', option: '5' }), state);
    state = quizReducer(state, { type: 'reveal' });
    assert.deepEqual(state, { phase: 'revealed', pick: '4' });
    assert.equal(answerVisible(state), true);
    assert.deepEqual(quizReducer(state, { type: 'reset' }), QUIZ_START);
  });

  it('the answer is right, and the sample picks cover every option', () => {
    assert.equal(QUIZ_ANSWER, String((14 - 6) / 2));
    assert.ok(QUIZ_OPTIONS.includes(QUIZ_ANSWER));
    assert.deepEqual(
      Object.keys(QUIZ_TEAM_PICKS).sort(),
      [...QUIZ_OPTIONS].sort()
    );
    // The component marks the right option only once it is visible.
    assert.match(
      source('live-class.tsx'),
      /const right = revealed && option === QUIZ_ANSWER;/
    );
  });
});

describe('EduFest demos: one vote per visitor', () => {
  it('a cast vote is final until the preview is reset', () => {
    assert.equal(voteReducer(VOTE_START, { type: 'cast' }), VOTE_START);
    let state = voteReducer(VOTE_START, { type: 'choose', booth: 'b2' });
    state = voteReducer(state, { type: 'cast' });
    assert.deepEqual(state, { phase: 'cast', choice: 'b2' });
    assert.equal(voteReducer(state, { type: 'choose', booth: 'a1' }), state);
    assert.equal(voteReducer(state, { type: 'cast' }), state);
    assert.deepEqual(voteReducer(state, { type: 'reset' }), VOTE_START);
    assert.equal(new Set(BOOTHS).size, BOOTHS.length);
  });
});

describe('EduFest demos: copy and honesty', () => {
  it('every demo id has copy in EN and VI', () => {
    for (const t of [en, vi]) {
      for (const tab of LIVE_TABS) assert.ok(t.liveClass.tabs[tab], tab);
      for (const q of ASK_QUESTIONS)
        for (const mode of ASK_MODES)
          assert.ok(t.liveClass.ask.questions[q][mode], `${q}.${mode}`);
      for (const id of AGENT_STEPS)
        assert.ok(t.agentTeam.steps[id].title && t.agentTeam.steps[id].body);
      for (const id of AGENDA) assert.ok(t.agenda.seats[AGENDA_SEATS[id]], id);
      assert.match(t.booth.cast, /\{booth\}/);
      assert.match(t.booth.chosen, /\{booth\}/);
    }
  });

  it('the workshop runs on hints; people request and approve', () => {
    assert.equal(WORKSHOP_ASK_MODE, 'hint');
    assert.deepEqual([...HUMAN_STEPS], ['request', 'approve']);
    // The booth preview is labelled Coming and states it is not public.
    assert.match(source('booth-hall.tsx'), /label=\{t\.demos\.coming\}/);
    assert.match(vi.booth.note, /chưa công khai/);
    // Sample numbers are labelled as demo data wherever they appear.
    assert.equal(
      source('live-class.tsx').match(/t\.liveClass\.demoData/g)?.length,
      2
    );
  });
});

describe('EduFest demos: the live class keeps its state across tabs', () => {
  it('every panel stays mounted, and inactive panels are invisible', () => {
    const component = source('live-class.tsx');
    assert.equal(
      component.match(/<TabsContent[^>]*\bforceMount\b/g)?.length,
      3
    );
    const hidden = cssDeclarations(readStyles()).filter(
      (d) => d.selector === '.ws-live-panel[data-state="inactive"]'
    );
    assert.ok(
      hidden.some((d) => d.property === 'visibility' && d.value === 'hidden')
    );
    // Broken variant: without forceMount, Radix unmounts the quiz on switch.
    assert.equal(
      '<TabsContent value="quiz" className="ws-live-panel">'.match(
        /<TabsContent[^>]*\bforceMount\b/g
      ),
      null
    );
  });
});

describe('EduFest demos: motion', () => {
  it('the new infinite animations run only in the rich tier', () => {
    const infinite = cssDeclarations(readStyles()).filter(
      (d) => d.property === 'animation' && /\binfinite\b/.test(d.value)
    );
    for (const name of ['ws-flow-pulse', 'ws-halo']) {
      const rule = infinite.find((d) => d.value.includes(name));
      assert.ok(rule, name);
      assert.match(rule.selector, /^:root:not\(\[data-lite\]\) /);
      assert.ok(rule.media.some((m) => /min-width: 1024px/.test(m)));
    }
  });
});
