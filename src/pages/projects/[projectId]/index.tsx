import { ReactElement, useEffect } from 'react';
import NestedLayout from '../../../components/layout/NestedLayout';
import { useAppearance } from '../../../hooks/useAppearance';

const ProjectOverviewPage = () => {
  const { setRootSegment } = useAppearance();

  useEffect(() => {
    setRootSegment(['Tuturuuu', 'Test Project', 'Overview']);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="grid gap-4">
      <div className="p-4 bg-zinc-900 rounded-lg">
        <h1 className="font-bold">Overview</h1>
        <p className="text-zinc-400">
          This is the overview page for the Test Project project.
        </p>
      </div>
    </div>
  );
};

ProjectOverviewPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout orgMode={false}>{page}</NestedLayout>;
};

export default ProjectOverviewPage;
