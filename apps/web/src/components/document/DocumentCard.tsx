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
}

const DocumentCard = ({ projectId, document, hideProject = true }: Props) => {
  const { id, name, content, project_id, created_at } = document;

  const pid = projectId ?? project_id;
  const showProject = !hideProject && pid;

  const href = id && showProject ? `/projects/${pid}/documents/${id}` : '';
  const { data: project } = useSWR(pid ? `/api/projects/${pid}` : null);

  return (
    <Link
      href={href}
      key={`doc-${id}`}
      className="relative flex flex-col justify-between rounded-lg border border-zinc-800/80 bg-[#19191d] p-4 transition hover:bg-zinc-800/80"
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
                className="prose line-clamp-5"
                dangerouslySetInnerHTML={{
                  __html: document.content || '',
                }}
              />
            </p>
          </>
        )}
      </div>

      <div className="mt-8 flex flex-wrap gap-2 justify-self-end font-semibold">
        {hideProject || (
          <div className="flex max-w-full gap-2 rounded-lg bg-purple-300/10 px-4 py-2 text-purple-300">
            <Squares2X2Icon className="w-6 flex-none" />
            <div className="line-clamp-1">
              {project?.name || 'Untitled Project'}
            </div>
          </div>
        )}
        <div className="flex max-w-full gap-2 rounded-lg bg-blue-300/10 px-4 py-2 text-blue-300">
          <DocumentPlusIcon className="w-6 flex-none" />
          <div className="line-clamp-1">{moment(created_at).fromNow()}</div>
        </div>
      </div>
    </Link>
  );
};

export default DocumentCard;
