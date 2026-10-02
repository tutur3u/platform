import type {
  ProgrammingAuthorProblem,
  ProgrammingProblem,
} from '@tuturuuu/types/primitives/programming';
import { useEffect, useState } from 'react';
import { ProgrammingCatalog } from '../../src/app/[locale]/(dashboard)/[wsId]/programming/catalog';
import { ProgrammingProblemForm } from '../../src/app/[locale]/(dashboard)/[wsId]/programming/problem-form';
import { ProgrammingWorkspace } from '../../src/app/[locale]/(dashboard)/[wsId]/programming/programming-workspace';
import { state } from './canonical-actions';
import { navigate } from './canonical-navigation';
export const fixtureWorkspace = '11111111-1111-4111-8111-111111111111';
const problem = (id: string, title: string): ProgrammingProblem => ({
  id,
  slug: title.toLowerCase(),
  title: { en: title, vi: title },
  prompt: { en: 'Synthetic public prompt', vi: 'Đề công khai tổng hợp' },
  difficulty: 'easy',
  topic: 'arrays',
  revision: 1,
  status: 'published',
  editable: true,
  starterCode: `# ${title} starter\n`,
  publicCases: [{ input: '1\n', output: '1\n' }],
});
export const fixtures = [
  problem('44444444-4444-4444-8444-444444444444', 'Alpha'),
  problem('55555555-5555-4555-8555-555555555555', 'Beta'),
];
export function CanonicalHarness() {
  const [url, setUrl] = useState(() => location.pathname + location.search);
  const [actorId, setActor] = useState('synthetic-actor');
  useEffect(() => {
    const update = () => {
      state.historyFixture = new URL(location.href).searchParams.has('history');
      setUrl(location.pathname + location.search);
    };
    update();
    Object.assign(window, { qaCanonical: { state, navigate, setActor } });
    window.addEventListener('popstate', update);
    return () => window.removeEventListener('popstate', update);
  }, []);
  const route = new URL(url, location.origin);
  const selected = fixtures.find((entry) => route.pathname.endsWith(entry.id));
  if (selected)
    return (
      <div className="h-dvh">
        <ProgrammingWorkspace
          problem={selected}
          catalog={fixtures}
          readOnly={route.searchParams.has('parent')}
          availableLanguages={['python', 'javascript']}
          scope={{
            actorId,
            wsId: fixtureWorkspace,
            learnerId: 'synthetic-learner',
            problemId: selected.id,
          }}
        />
      </div>
    );
  if (route.pathname.endsWith('/new'))
    return (
      <div className="p-4">
        <ProgrammingProblemForm wsId={fixtureWorkspace} />
      </div>
    );
  if (route.pathname.endsWith('/edit')) {
    const author: ProgrammingAuthorProblem = {
      ...fixtures[0]!,
      cases: [
        { input: '1', expected: '1', visible: true },
        {
          input: 'PRIVATE SYNTHETIC',
          expected: 'SYNTHETIC ANSWER',
          visible: false,
        },
      ],
    };
    return (
      <div className="p-4">
        <ProgrammingProblemForm
          key={url}
          wsId={fixtureWorkspace}
          problem={author}
        />
      </div>
    );
  }
  return (
    <ProgrammingCatalog
      wsId={fixtureWorkspace}
      locale="en"
      author={route.searchParams.get('mode') === 'author'}
      canAuthor={route.searchParams.get('manager') === 'true'}
      problems={route.searchParams.has('empty') ? [] : fixtures}
      nextCursor={route.searchParams.has('cursor') ? null : fixtures[1]!.id}
    />
  );
}
