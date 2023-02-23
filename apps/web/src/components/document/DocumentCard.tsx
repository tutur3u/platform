import Link from 'next/link';
import { Document } from '../../types/primitives/Document';
import { Divider } from '@mantine/core';
import moment from 'moment';
import { DocumentPlusIcon } from '@heroicons/react/24/solid';

interface Props {
  projectId?: string;
  document: Document;
}

const DocumentCard = ({ projectId, document }: Props) => {
  const { id, name, content, project_id, created_at } = document;

  const hasProjectId = !!(projectId || project_id);
  const hasId = !!id;

  const href =
    hasProjectId && hasId
      ? `/projects/${projectId ?? project_id}/documents/${id}`
      : '';

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

      <div className="mt-8 justify-self-end">
        <div className="flex w-fit gap-2 rounded-lg bg-blue-300/10 px-4 py-2 font-semibold text-blue-300">
          <DocumentPlusIcon className="w-6" /> {moment(created_at).fromNow()}
        </div>
      </div>
    </Link>
  );
};

export default DocumentCard;
