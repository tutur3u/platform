import type { Team } from '@tuturuuu/multiplayer';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useState } from 'react';
import { useCopy } from './i18n';
import { MockDesk } from './mock-desk';

export function TeamDesk({
  team,
  writable,
  busy,
  action,
  active = true,
  section = 'team-prompt',
}: {
  team: Team;
  writable: boolean;
  busy: boolean;
  action: (body: Record<string, unknown>, route?: string) => Promise<void>;
  active?: boolean;
  section?: string;
}) {
  const c = useCopy();
  const [draft, setDraft] = useState(team.prompt);
  const [revision, setRevision] = useState(team.revision);
  const [multiple, setMultiple] = useState(true);
  const changed = draft !== team.prompt;
  const stale = revision !== team.revision;
  const invoke = (body: Record<string, unknown>, route?: string) => {
    void action(body, route).catch(() => {});
  };
  return (
    <>
      <Card
        id={active ? 'team-prompt' : undefined}
        hidden={section !== 'team-prompt'}
        className="panel prompt-panel"
      >
        <div className="panel-heading">
          <div>
            <span className="section-number">01 / {c.promptSection}</span>
            <h2>{c.promptTitle}</h2>
          </div>
          <Badge variant="outline">system.md</Badge>
        </div>
        <p>{c.promptHelp}</p>
        <Badge variant="secondary" className="mb-3">
          {!writable
            ? c.studio.viewOnly
            : changed
              ? c.studio.unsaved
              : c.studio.saved}
        </Badge>
        {writable ? (
          <>
            <label className="sr-only" htmlFor="prompt">
              {c.promptLabel}
            </label>
            <Textarea
              id="prompt"
              className="prompt-editor min-h-64"
              maxLength={12000}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={c.starterText}
            />
            <div className="editor-meta">
              <span>{c.draftNotice}</span>
              <span>{draft.length}/12,000</span>
            </div>
            {stale && (
              <p className="notice">
                {c.newer}{' '}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setDraft(team.prompt);
                    setRevision(team.revision);
                  }}
                >
                  {c.reload}
                </Button>
              </p>
            )}
            <div className="action-row">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setDraft(c.starterText)}
              >
                {c.starter}
              </Button>
              <Button
                type="button"
                disabled={busy || !changed || stale}
                onClick={async () => {
                  try {
                    await action({ action: 'prompt', prompt: draft, revision });
                    setRevision(revision + 1);
                  } catch {}
                }}
              >
                {busy ? c.working : changed ? c.save : c.saved}
              </Button>
            </div>
          </>
        ) : (
          <pre className="readonly-prompt">{team.prompt || c.emptyPrompt}</pre>
        )}
      </Card>
      <Card
        id={active ? 'team-skills' : undefined}
        hidden={section !== 'team-skills'}
        className="panel skills-panel"
      >
        <div className="panel-heading">
          <div>
            <span className="section-number">02 / {c.skillsSection}</span>
            <h2>{c.skills}</h2>
          </div>
          <Badge variant="outline">.md</Badge>
        </div>
        {writable && (
          <div className="compile-row">
            <label className="checkbox">
              <Checkbox
                checked={multiple}
                onCheckedChange={(checked) => setMultiple(checked === true)}
              />
              {c.multiple}
            </label>
            <Button
              type="button"
              size="sm"
              disabled={busy || changed || team.prompt.length < 10}
              onClick={() => invoke({ action: 'compile', multiple }, 'ai')}
            >
              {busy ? c.working : c.compile}
            </Button>
          </div>
        )}
        {changed && writable && <p className="fine-print">{c.saveBefore}</p>}
        {team.skills.length ? (
          team.skills.map((skill) => (
            <details className="skill-file" key={skill.name}>
              <summary>
                <span className="file-icon">↳</span>
                <strong>{skill.name}/SKILL.md</strong>
                <span>↓</span>
              </summary>
              <p>{skill.description}</p>
              <pre>{skill.markdown}</pre>
              <Button
                type="button"
                onClick={() => {
                  const url = URL.createObjectURL(
                    new Blob([skill.markdown], {
                      type: 'text/markdown;charset=utf-8',
                    })
                  );
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `${skill.name}-SKILL.md`;
                  a.click();
                  setTimeout(() => URL.revokeObjectURL(url), 1000);
                }}
              >
                {c.download}
              </Button>
            </details>
          ))
        ) : (
          <p className="empty">{c.skillsEmpty}</p>
        )}
      </Card>
      <div hidden={section !== 'sandbox-desk'}>
        <MockDesk team={team} active={active} />
      </div>
      <Card
        id={active ? 'practice-journal' : undefined}
        hidden={section !== 'practice-journal'}
        className="panel journal-panel"
      >
        <div className="panel-heading">
          <div>
            <span className="section-number">04 / {c.reflectSection}</span>
            <h2>{c.runs}</h2>
          </div>
          {writable && (
            <Button
              type="button"
              size="sm"
              disabled={busy || changed || !team.skills.length}
              onClick={() => invoke({ action: 'run' }, 'ai')}
            >
              {busy ? c.working : c.run} <span aria-hidden="true">↗</span>
            </Button>
          )}
        </div>
        {!team.runs.length && <p className="empty">{c.runsEmpty}</p>}
        {[...team.runs].reverse().map((run, i) => (
          <details className="run" key={run.id} open={i === 0}>
            <summary>
              <strong>#{team.runs.length - i}</strong>{' '}
              {new Date(run.at).toLocaleString()}{' '}
              <span>
                {run.trace.length} {c.trace}
              </span>
            </summary>
            <h3>{c.result}</h3>
            <pre>{run.answer}</pre>
            <h3>{c.feedback}</h3>
            <pre className="feedback">{run.feedback}</pre>
            <h3>{c.trace}</h3>
            {run.trace.map((trace, j) => (
              <details className="trace" key={`${run.id}-${j}`}>
                <summary>
                  {j + 1}. {trace.tool}
                </summary>
                <pre>{trace.input}</pre>
                <pre>{trace.output}</pre>
              </details>
            ))}
            <details>
              <summary>{c.viewPrompt}</summary>
              <pre>{run.prompt}</pre>
            </details>
          </details>
        ))}
      </Card>
    </>
  );
}
