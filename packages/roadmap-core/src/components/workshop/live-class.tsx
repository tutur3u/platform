/**
 * EduFest workshop page: the interactive live-class demo. Three views of one
 * class: asking the assistant (hint or answer), a team quiz whose answer
 * stays hidden until the reveal, and the swap to the teacher's seat.
 */
import { Check, Lock, Sparkles, Users } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { useReducer, useRef, useState } from 'react';
import {
  ASK_MODES,
  ASK_QUESTIONS,
  type AskMode,
  type AskQuestion,
  answerVisible,
  LIVE_TABS,
  QUIZ_ANSWER,
  QUIZ_OPTIONS,
  QUIZ_START,
  QUIZ_TEAM_PICKS,
  quizReducer,
  TEACHER_VIEW,
  WORKSHOP_ASK_MODE,
} from '../../content/workshops/edufest-2026-demos';
import { AI_LEVELS_DELIVERABLE } from '../../content/workshops/edufest-2026';
import { type EduMessages, type Statuses, WsBadge } from './shared';

export function WsLiveClass({
  t,
  statuses,
}: {
  t: EduMessages;
  statuses: Statuses;
}) {
  const copy = t.liveClass;
  return (
    <section className="section ws-live" aria-labelledby="ws-live">
      <header className="section-head">
        <h2 id="ws-live">{copy.title}</h2>
        <p>{copy.subtitle}</p>
      </header>
      <Tabs defaultValue="ask" className="ws-live-frame">
        <div className="ws-live-bar">
          <span className="ws-live-dot" aria-hidden />
          <span className="ws-live-window">{copy.window}</span>
          <span className="ws-live-demo">{copy.demo}</span>
        </div>
        <TabsList className="ws-live-tabs" aria-label={copy.tabsLabel}>
          {LIVE_TABS.map((tab) => (
            <TabsTrigger key={tab} value={tab}>
              {copy.tabs[tab]}
            </TabsTrigger>
          ))}
        </TabsList>
        {/* Every panel stays mounted in one grid cell: switching keeps each
            view's state, and the frame is as tall as the tallest view, so a
            switch never moves the page. Inactive panels are invisible, which
            also takes them out of the tab order and the accessibility tree. */}
        <div className="ws-live-stack">
          <TabsContent value="ask" forceMount className="ws-live-panel">
            <AskPanel t={t} status={statuses.get(AI_LEVELS_DELIVERABLE)} />
          </TabsContent>
          <TabsContent value="quiz" forceMount className="ws-live-panel">
            <QuizPanel t={t} />
          </TabsContent>
          <TabsContent value="seats" forceMount className="ws-live-panel">
            <SeatsPanel t={t} />
          </TabsContent>
        </div>
      </Tabs>
    </section>
  );
}

function AskPanel({
  t,
  status,
}: {
  t: EduMessages;
  status: ReturnType<Statuses['get']>;
}) {
  const copy = t.liveClass.ask;
  const [question, setQuestion] = useState<AskQuestion>('equation');
  const [mode, setMode] = useState<AskMode>(WORKSHOP_ASK_MODE);
  const thread = copy.questions[question];
  return (
    <div className="ws-ask">
      <div className="ws-ask-thread" aria-live="polite">
        <p className="ws-msg you">
          <b>{copy.you}</b>
          {thread.q}
        </p>
        <p key={`${question}-${mode}`} className={`ws-msg ai ${mode}`}>
          <b>
            <Sparkles size={14} aria-hidden />
            {copy.assistant}
            <span className="ws-msg-tag">{copy.modes[mode]}</span>
          </b>
          {thread[mode]}
        </p>
      </div>
      <div className="ws-ask-controls">
        <fieldset className="ws-choice">
          <legend>{copy.modeLabel}</legend>
          {ASK_MODES.map((item) => (
            <Button
              key={item}
              type="button"
              size="sm"
              variant={mode === item ? 'default' : 'outline'}
              aria-pressed={mode === item}
              onClick={() => setMode(item)}
            >
              {copy.modes[item]}
            </Button>
          ))}
        </fieldset>
        <p className="ws-note">
          {copy.workshopNote} <WsBadge status={status ?? 'planned'} t={t} />
        </p>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() =>
            setQuestion(
              ASK_QUESTIONS[
                (ASK_QUESTIONS.indexOf(question) + 1) % ASK_QUESTIONS.length
              ] ?? 'equation'
            )
          }
        >
          {copy.another}
        </Button>
      </div>
    </div>
  );
}

function QuizPanel({ t }: { t: EduMessages }) {
  const copy = t.liveClass.quiz;
  const [state, dispatch] = useReducer(quizReducer, QUIZ_START);
  const firstOption = useRef<HTMLButtonElement>(null);
  const revealed = answerVisible(state);
  const total = Object.values(QUIZ_TEAM_PICKS).reduce((a, b) => a + b, 0);
  return (
    <div className="ws-quiz">
      <p className="ws-quiz-q">{copy.question}</p>
      <ul className="ws-quiz-options" role="list">
        {QUIZ_OPTIONS.map((option) => {
          const picked = state.pick === option;
          const right = revealed && option === QUIZ_ANSWER;
          const share = Math.round((QUIZ_TEAM_PICKS[option] / total) * 100);
          return (
            <li key={option}>
              <button
                ref={option === QUIZ_OPTIONS[0] ? firstOption : undefined}
                type="button"
                className="ws-quiz-option"
                data-picked={picked || undefined}
                data-right={right || undefined}
                aria-pressed={picked}
                disabled={state.phase !== 'picking'}
                onClick={() => dispatch({ type: 'pick', option })}
              >
                <span className="ws-quiz-value">x = {option}</span>
                {revealed ? (
                  <span className="ws-quiz-share">
                    <span
                      className="ws-quiz-fill"
                      style={{ transform: `scaleX(${share / 100})` }}
                      aria-hidden
                    />
                    {QUIZ_TEAM_PICKS[option]}/{total} {copy.teams}
                  </span>
                ) : picked && state.phase === 'locked' ? (
                  <Lock size={14} aria-label={copy.hidden} />
                ) : null}
                {right ? <Check size={16} aria-hidden /> : null}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="ws-quiz-foot" aria-live="polite">
        {state.phase === 'picking' ? (
          <>
            <p>{copy.pickPrompt}</p>
            <Button
              type="button"
              size="sm"
              disabled={!state.pick}
              onClick={() => dispatch({ type: 'lock' })}
            >
              {copy.lock}
            </Button>
          </>
        ) : state.phase === 'locked' ? (
          <>
            <p>{copy.locked}</p>
            <Button
              type="button"
              size="sm"
              onClick={() => dispatch({ type: 'reveal' })}
            >
              {copy.reveal}
            </Button>
          </>
        ) : (
          <>
            <p>
              {state.pick === QUIZ_ANSWER ? copy.right : copy.wrong}{' '}
              <span className="ws-demo-tag">{t.liveClass.demoData}</span>
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                dispatch({ type: 'reset' });
                // The reset button disappears; keep focus in the quiz.
                requestAnimationFrame(() => firstOption.current?.focus());
              }}
            >
              {copy.reset}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function SeatsPanel({ t }: { t: EduMessages }) {
  const copy = t.liveClass.seats;
  const [seat, setSeat] = useState<'student' | 'teacher'>('student');
  const joined = TEACHER_VIEW.joined / TEACHER_VIEW.seats;
  return (
    <div className="ws-seats-panel">
      <div className="ws-choice" role="group" aria-label={copy.label}>
        {(['student', 'teacher'] as const).map((item) => (
          <Button
            key={item}
            type="button"
            size="sm"
            variant={seat === item ? 'default' : 'outline'}
            aria-pressed={seat === item}
            onClick={() => setSeat(item)}
          >
            {copy[item]}
          </Button>
        ))}
      </div>
      {seat === 'student' ? (
        <div className="ws-seat-view" key="student">
          <p className="ws-seat-kicker">{copy.studentKicker}</p>
          <p>{copy.studentBody}</p>
        </div>
      ) : (
        <div className="ws-seat-view is-teacher" key="teacher">
          <p className="ws-seat-kicker">
            {copy.teacherKicker}{' '}
            <span className="ws-demo-tag">{t.liveClass.demoData}</span>
          </p>
          <dl className="ws-kpi">
            <div>
              <dt>
                <Users size={14} aria-hidden />
                {copy.joined}
              </dt>
              <dd>
                {TEACHER_VIEW.joined}/{TEACHER_VIEW.seats}
                <span className="ws-meter" aria-hidden>
                  <span style={{ transform: `scaleX(${joined})` }} />
                </span>
              </dd>
            </div>
            <div>
              <dt>
                <Sparkles size={14} aria-hidden />
                {copy.hints}
              </dt>
              <dd>{TEACHER_VIEW.hints}</dd>
            </div>
          </dl>
          <p className="ws-seat-kicker">{copy.stuckTitle}</p>
          <ul className="ws-stuck-list">
            {TEACHER_VIEW.stuck.map((id) => (
              <li key={id}>{copy.stuck[id]}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
