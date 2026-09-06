import {
  ArrowRight,
  BookOpen,
  FlaskConical,
  ShieldCheck,
  Users,
} from '@tuturuuu/icons';
import type { Identity } from '@tuturuuu/multiplayer';
import { Button } from '@tuturuuu/ui/button';
import { Home } from './home';
import { appNames, useCopy } from './i18n';
import { LandingPreview, WorkshopDetails } from './landing-preview';

export function WorkspacePages(props: {
  canHost: boolean;
  identity: Identity | null;
  navigate: (id: string) => void;
}) {
  const c = useCopy();
  const w = c.workspace;
  const path = location.pathname;
  if (path === '/join' || path === '/host')
    return <Home {...props} mode={path === '/host' ? 'host' : 'join'} />;
  if (path === '/guide')
    return (
      <div className="home workspace-guide">
        <div className="lobby-heading">
          <div>
            <h1>{c.practiceGuide}</h1>
            <p>{w.guideDescription}</p>
          </div>
        </div>
        <LandingPreview />
        <WorkshopDetails />
      </div>
    );
  const recent = localStorage.getItem('colab-recent-room');
  return (
    <div className="home workspace-home">
      <section className="workspace-welcome">
        <div>
          <p className="workspace-eyebrow">{w.eyebrow}</p>
          <h1>
            {w.welcome}
            {props.identity?.name ? `, ${props.identity.name}` : ''}
          </h1>
          <p>{w.description}</p>
        </div>
        {recent && (
          <Button asChild>
            <a href="/join">
              <Users className="size-4" />
              {c.join}
            </a>
          </Button>
        )}
      </section>
      <section className="workspace-session" aria-labelledby="sessions-title">
        <div className="workspace-section-title">
          <h2 id="sessions-title">{w.sessions}</h2>
          <span>
            <ShieldCheck className="size-3.5" />
            {w.privateLabel}
          </span>
        </div>
        {recent ? (
          <button
            type="button"
            className="workspace-recent"
            onClick={() => props.navigate(recent)}
          >
            <div className="workspace-session-icon">
              <FlaskConical className="size-5" />
            </div>
            <div>
              <strong>{c.recent}</strong>
              <p>{w.recentDescription}</p>
            </div>
            <ArrowRight className="size-4" />
          </button>
        ) : (
          <div className="workspace-empty">
            <FlaskConical className="size-7" />
            <h3>{w.emptyTitle}</h3>
            <p>{w.emptyDescription}</p>
            <Button variant="outline" asChild>
              <a href="/join">
                {c.join}
                <ArrowRight className="size-4" />
              </a>
            </Button>
          </div>
        )}
      </section>
      <section className="workspace-next" aria-label={w.next}>
        {props.canHost && (
          <a className="workspace-action" href="/host">
            <FlaskConical className="size-5" />
            <div>
              <h2>{c.host}</h2>
              <p>{w.hostDescription}</p>
            </div>
            <ArrowRight className="size-4" />
          </a>
        )}
        <a className="workspace-action" href="/guide">
          <BookOpen className="size-5" />
          <div>
            <h2>{c.practiceGuide}</h2>
            <p>{w.guideDescription}</p>
          </div>
          <ArrowRight className="size-4" />
        </a>
      </section>
      <section className="workspace-sandbox">
        <div>
          <ShieldCheck className="size-4" />
          <h2>{c.safeWorkspace}</h2>
        </div>
        <p>{c.sandboxHelp}</p>
        <div className="workspace-apps">
          {Object.entries(appNames).map(([id, name]) => (
            <span key={id}>{name}</span>
          ))}
        </div>
      </section>
    </div>
  );
}
