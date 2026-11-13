/** EduFest workshop page: the student/teacher journey simulator. */
import { ArrowLeft, ArrowRight } from '@tuturuuu/icons';
import { useId, useState } from 'react';
import {
  AI_LEVELS,
  AI_LEVELS_DELIVERABLE,
  type AiLevel,
  isAiLevelStep,
  JOURNEY,
  TEACHER_SEAT_FROM,
} from '../../content/workshops/edufest-2026';
import {
  type EduMessages,
  UpskiiMark,
  UpskiiText,
  type Statuses,
  WsBadge,
  UseCaseRow,
} from './shared';

/**
 * The integrated demo: one mock class screen that walks the role-play
 * journey, with the teacher's AI-help level, a timed quick check and the
 * capabilities each step relies on (labels derived from the roadmap).
 */
export function WsSimulator({
  t,
  statuses,
}: {
  t: EduMessages;
  statuses: Statuses;
}) {
  const [index, setIndex] = useState(0);
  const [level, setLevel] = useState<AiLevel>('hints');
  const levelName = useId();
  const step = JOURNEY[index] ?? JOURNEY[0];
  const teacherFrom = JOURNEY.findIndex(
    (item) => item.id === TEACHER_SEAT_FROM
  );
  const teacher = index >= teacherFrom;
  type StepId = keyof EduMessages['journey']['steps'];
  const copy = t.journey.steps[step.id as StepId];
  const aiStatus = statuses.get(AI_LEVELS_DELIVERABLE) ?? 'planned';
  return (
    <section className="section ws-stage" aria-labelledby="ws-sim">
      <header className="section-head">
        <h2 id="ws-sim">{t.sim.title}</h2>
        <p>{t.sim.subtitle}</p>
      </header>
      <div className="ws-sim">
        <ol className="ws-sim-rail">
          {JOURNEY.map((item, position) => (
            <li key={item.id}>
              <button
                type="button"
                aria-current={position === index ? 'step' : undefined}
                onClick={() => setIndex(position)}
              >
                <span className="ws-sim-dot" aria-hidden>
                  {position + 1}
                </span>
                {/* No link inside a button: the step's screen links Upskii. */}
                <UpskiiMark text={t.journey.steps[item.id as StepId].title} />
              </button>
            </li>
          ))}
        </ol>
        <div className="ws-device">
          <div className="ws-device-bar">
            <span className="ws-device-dots" aria-hidden>
              <i />
              <i />
              <i />
            </span>
            <span className="ws-device-title">{t.sim.window}</span>
            <span className={`ws-seat ${teacher ? 'teacher' : 'student'}`}>
              {teacher ? t.journey.seatTeacher : t.journey.seatStudent}
            </span>
          </div>
          <div className="ws-device-screen" aria-live="polite">
            <p className="ws-step-count">
              {t.journey.step} {index + 1}/{JOURNEY.length}
            </p>
            <h3>
              <UpskiiText text={copy.title} />
            </h3>
            <p className="ws-device-body">{copy.body}</p>
            {step.id === 'stuck' ? (
              <div className="ws-chat">
                <p className="ws-bubble student">
                  <span className="ws-who">{t.aiDemo.student}</span>
                  {t.aiDemo.question}
                </p>
                <p className={`ws-bubble assistant ${level}`}>
                  <span className="ws-who">{t.aiDemo.assistant}</span>
                  {t.aiDemo.levels[level].reply}
                </p>
              </div>
            ) : null}
            {step.id === 'practise' ? (
              <div className="ws-chat">
                <p className="ws-bubble student">
                  <span className="ws-who">{t.aiDemo.student}</span>
                  {t.aiDemo.practise.question}
                </p>
                <p className={`ws-bubble assistant ${level}`}>
                  <span className="ws-who">{t.aiDemo.assistant}</span>
                  {t.aiDemo.practise[level]}
                </p>
              </div>
            ) : null}
            {step.id === 'check' ? (
              <div className="ws-quiz">
                <p className="ws-quiz-q">{t.sim.quizQuestion}</p>
                <div className="ws-quiz-timer" aria-hidden>
                  <span />
                </div>
                <p className="ws-quiz-meta">
                  <span>{t.sim.timer}</span>
                  <span className="ws-points">+1 {t.sim.points}</span>
                </p>
                <p className={`ws-bubble assistant ${level}`}>
                  <span className="ws-who">{t.aiDemo.assistant}</span>
                  {t.aiDemo.check[level]}
                </p>
              </div>
            ) : null}
            <p className="ws-uses-label">{t.journey.uses}</p>
            <ul className="ws-uses">
              {step.uses.map((id) => (
                <UseCaseRow key={id} id={id} t={t} statuses={statuses} />
              ))}
            </ul>
          </div>
          {/* The level control appears only where it changes the screen. */}
          {isAiLevelStep(step.id) ? (
            <div className="ws-device-foot">
              <fieldset className="segmented ws-levels">
                <legend>{t.aiDemo.legend}</legend>
                {AI_LEVELS.map((id) => (
                  <label key={id} data-checked={level === id ? '' : undefined}>
                    <input
                      type="radio"
                      name={levelName}
                      value={id}
                      checked={level === id}
                      onChange={() => setLevel(id)}
                    />
                    {t.aiDemo.levels[id].label}
                  </label>
                ))}
              </fieldset>
              <p className="ws-note">
                <WsBadge status={aiStatus} t={t} /> {t.aiDemo.note}
              </p>
            </div>
          ) : null}
          <div className="ws-step-nav">
            <button
              type="button"
              className="ws-ghost"
              disabled={index === 0}
              onClick={() => setIndex((value) => Math.max(0, value - 1))}
            >
              <ArrowLeft size={16} aria-hidden />
              {t.journey.previous}
            </button>
            <button
              type="button"
              className="ws-ghost"
              disabled={index === JOURNEY.length - 1}
              onClick={() =>
                setIndex((value) => Math.min(JOURNEY.length - 1, value + 1))
              }
            >
              {t.journey.next}
              <ArrowRight size={16} aria-hidden />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
