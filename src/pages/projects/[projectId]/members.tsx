import { ReactElement, useEffect } from 'react';
import NestedLayout from '../../../components/layout/NestedLayout';
import { useAppearance } from '../../../hooks/useAppearance';

const ProjectMembersPage = () => {
  const { setRootSegment } = useAppearance();

  useEffect(() => {
    setRootSegment(['Projects', 'Test Project', 'Members']);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="grid gap-4">
      <div className="p-4 bg-zinc-900 rounded-lg">
        <h1 className="font-bold">Members</h1>
        <p className="text-zinc-400">
          This is the members page for the Test Project project.
        </p>
      </div>
    </div>
  );
};

ProjectMembersPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout orgMode={false}>{page}</NestedLayout>;
};

export default ProjectMembersPage;
