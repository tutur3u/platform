import Link from 'next/link';
import { useRouter } from 'next/router';
import { ReactElement, useEffect } from 'react';
import useSWR from 'swr';
import NestedLayout from '../../../components/layout/NestedLayout';
import { useAppearance } from '../../../hooks/useAppearance';

const OrganizationProjectsPage = () => {
  const router = useRouter();
  const { orgId } = router.query;

  const { data, error } = useSWR(`/api/orgs/${orgId}`);
  const isLoading = !data && !error;

  const { setRootSegment } = useAppearance();

  useEffect(() => {
    setRootSegment(
      data?.name
        ? [
            {
              content: data.name,
              href: `/orgs/${data.id}`,
            },
            {
              content: 'Projects',
              href: `/orgs/${data.id}/projects`,
            },
          ]
        : []
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.name]);

  if (isLoading) return <div>Loading...</div>;

  return (
    <div className="grid gap-4">
      <h1 className="font-bold">Projects</h1>

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        <Link
          href="/projects/test"
          className="p-4 bg-zinc-900 hover:bg-zinc-800/80 rounded-lg h-72 transition duration-300"
        >
          <h1 className="font-bold">Test project</h1>
        </Link>
      </div>
    </div>
  );
};

OrganizationProjectsPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout>{page}</NestedLayout>;
};

export default OrganizationProjectsPage;
