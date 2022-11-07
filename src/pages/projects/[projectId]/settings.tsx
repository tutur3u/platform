import { ReactElement, useEffect } from 'react';
import NestedLayout from '../../../components/layout/NestedLayout';
import { useAppearance } from '../../../hooks/useAppearance';

const ProjectSettingsPage = () => {
  const { setRootSegment } = useAppearance();

  useEffect(() => {
    setRootSegment([
      { content: 'Tuturuuu', href: '/' },
      { content: 'Test Project', href: '/projects/test' },
      { content: 'Settings', href: '/projects/test/settings' },
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="grid gap-4">
      <div className="p-4 bg-zinc-900 rounded-lg">
        <h1 className="font-bold">Settings</h1>
        <p className="text-zinc-400">
          This is the settings page for the Test Project project.
        </p>
      </div>
    </div>
  );
};

ProjectSettingsPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout orgMode={false}>{page}</NestedLayout>;
};

export default ProjectSettingsPage;
