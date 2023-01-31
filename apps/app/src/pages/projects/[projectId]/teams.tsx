import { ReactElement, useEffect } from 'react';
import NestedLayout from '../../../components/layout/NestedLayout';
import { useAppearance } from '../../../hooks/useAppearance';

const ProjectTeamsPage = () => {
  const { setRootSegment } = useAppearance();

  useEffect(() => {
    setRootSegment([
      { content: 'Tuturuuu', href: '/' },
      { content: 'Test Project', href: '/projects/test' },
      { content: 'Teams', href: '/projects/test/teams' },
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="grid gap-4">
      <div className="rounded-lg bg-zinc-900 p-4">
        <h1 className="font-bold">Teams</h1>
        <p className="text-zinc-400">
          This is the teams page for the Test Project project.
        </p>
      </div>
    </div>
  );
};

ProjectTeamsPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout orgMode={false}>{page}</NestedLayout>;
};

export default ProjectTeamsPage;
