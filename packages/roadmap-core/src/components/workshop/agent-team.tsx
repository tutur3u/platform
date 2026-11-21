/**
 * EduFest workshop page: how a change reaches teachers, as a flow of steps
 * owned by people or by AI agents. The pulse that travels along the flow is
 * decoration; the ordered list carries the meaning.
 */
import {
  Bot,
  ClipboardList,
  GitBranch,
  MessageSquare,
  Rocket,
  ShieldCheck,
} from '@tuturuuu/icons';
import {
  AGENT_STEPS,
  HUMAN_STEPS,
} from '../../content/workshops/edufest-2026-demos';
import type { EduMessages } from './shared';

const STEP_ICON = {
  request: MessageSquare,
  plan: ClipboardList,
  build: GitBranch,
  review: Bot,
  approve: ShieldCheck,
  ship: Rocket,
} as const;

export function WsAgentTeam({ t }: { t: EduMessages }) {
  const copy = t.agentTeam;
  return (
    <section className="section" aria-labelledby="ws-agents">
      <header className="section-head">
        <h2 id="ws-agents">{copy.title}</h2>
        <p>{copy.subtitle}</p>
      </header>
      <ol className="ws-flowline">
        {AGENT_STEPS.map((id, index) => {
          const Icon = STEP_ICON[id];
          const human = HUMAN_STEPS.includes(id);
          return (
            <li
              key={id}
              className={`ws-flow-step ${human ? 'is-human' : 'is-agent'}`}
              style={{ '--ws-step': index } as React.CSSProperties}
            >
              <span className="ws-flow-node" aria-hidden>
                <Icon size={20} />
                {id === 'build' ? (
                  <span className="ws-flow-stack">
                    <i />
                    <i />
                    <i />
                  </span>
                ) : null}
              </span>
              <span className="ws-flow-actor">
                {human ? copy.actors.human : copy.actors.agent}
              </span>
              <h3>{copy.steps[id].title}</h3>
              <p>{copy.steps[id].body}</p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
