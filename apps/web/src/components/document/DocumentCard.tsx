import Link from 'next/link';
import { Document } from '../../types/primitives/Document';
import { Divider } from '@mantine/core';
import moment from 'moment';
import { DocumentPlusIcon, Squares2X2Icon } from '@heroicons/react/24/solid';
import useSWR from 'swr';

interface Props {
  projectId?: string;
  document: Document;
  hideProject?: boolean;
  mode: 'list' | 'grid';
}

const DocumentCard = ({
  projectId,
  document,
  hideProject = true,
  mode,
}: Props) => {
  const { id, name, content, project_id, created_at } = document;

  const pid = projectId ?? project_id;
  const showProject = !hideProject && pid;

  const href = id && pid ? `/projects/${pid}/documents/${id}` : '';
  const { data: project } = useSWR(showProject ? `/api/projects/${pid}` : null);

  return (
    <Link
      href={href}
      key={`doc-${id}`}
      className={`flex ${
        mode === 'list' ? 'items-center gap-4' : 'flex-col'
      } relative flex justify-between rounded-lg border border-zinc-800/80 bg-[#19191d] p-4 transition hover:bg-zinc-800/80`}
    >
      <div>
        <p className="line-clamp-1 font-semibold lg:text-lg xl:text-xl">
          {name || 'Untitled Document'}
        </p>

        {content && (
          <>
            <Divider className="my-2" />

            <p className="text-zinc-400">
              <div
                className="prose line-clamp-3"
                dangerouslySetInnerHTML={{
                  __html: document.content || '',
                }}
              />
            </p>
          </>
        )}
      </div>

      <div
        className={`${
          mode === 'grid' && 'mt-8'
        } flex flex-wrap items-center gap-2 justify-self-end text-sm font-semibold`}
      >
        {hideProject || (
          <div className="flex max-w-full items-center gap-1 rounded-lg bg-purple-300/10 px-2 py-1.5 text-purple-300">
            <Squares2X2Icon className="w-5 flex-none" />
            <div className="line-clamp-1">
              {project?.name || 'Untitled Project'}
            </div>
          </div>
        )}
        <div className="flex max-w-full items-center gap-1 rounded-lg bg-blue-300/10 px-2 py-1.5 text-blue-300">
          <DocumentPlusIcon className="w-5 flex-none" />
          <div className="line-clamp-1">{moment(created_at).fromNow()}</div>
        </div>
      </div>
    </Link>
  );
};

export default DocumentCard;
