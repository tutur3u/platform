import { Badge } from '@tuturuuu/ui/badge';
import { useState } from 'react';
import { toneBadge } from '../components/tone';
import { DigestSection } from './digest-section';
import { ChoiceField } from './fields';
import {
  type AskTopic,
  answerFromDigest,
  type DigestAnswer,
  laneTone,
} from './model';
import { ReadMessage, readState, UnavailableTab } from './query-message';
import { useFleetDigest } from './queries';
import { useFleetText } from './text';

const topics = ['status', 'readiness', 'timeline'] as const;

/** Typed questions answered from the caller's scoped digest only. */
export function AskTab({ projects }: { projects: string[] }) {
  const { t } = useFleetText();
  const [projectKey, setProjectKey] = useState(projects[0] ?? '');
  const [topic, setTopic] = useState<AskTopic>('status');
  const state = readState(useFleetDigest());
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <ChoiceField
          id="fleet-ask-project"
          label={t.ask.project}
          value={projectKey}
          options={projects.map((key) => ({ value: key, label: key }))}
          onChange={setProjectKey}
        />
        <ChoiceField
          id="fleet-ask-topic"
          label={t.ask.topic}
          value={topic}
          options={topics.map((value) => ({ value, label: t.topic[value] }))}
          onChange={setTopic}
        />
      </div>
      {state.kind === 'ready' ? (
        <Answer
          answer={answerFromDigest(state.data.sections, projectKey, topic)}
        />
      ) : (
        <ReadMessage state={state} />
      )}
    </>
  );
}

function Answer({ answer }: { answer: DigestAnswer }) {
  const { t } = useFleetText();
  switch (answer.kind) {
    case 'no-snapshot':
      return <UnavailableTab>{t.ask.noSnapshot}</UnavailableTab>;
    case 'status':
      return (
        <>
          {answer.counts.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {answer.counts.map(([state, count]) => (
                <Badge
                  key={state}
                  variant="outline"
                  className={toneBadge(laneTone[state])}
                >
                  {t.laneState[state]} {count}
                </Badge>
              ))}
            </div>
          )}
          <DigestSection section={answer.section} empty={t.ask.noLanes} />
        </>
      );
    case 'readiness':
      return (
        <DigestSection
          section={answer.section}
          lanes={answer.lanes}
          empty={t.ask.noReadiness}
        />
      );
    case 'timeline':
      return (
        <DigestSection
          section={answer.section}
          lanes={answer.lanes}
          empty={t.ask.noTimeline}
        />
      );
  }
}
