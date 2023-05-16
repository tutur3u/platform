import Link from 'next/link';
import { Document } from '../../types/primitives/Document';
import { Divider } from '@mantine/core';
import moment from 'moment';
import { DocumentPlusIcon } from '@heroicons/react/24/solid';
import useTranslation from 'next-translate/useTranslation';
import 'moment/locale/vi';

interface Props {
  wsId: string;
  document: Document;
  mode: 'list' | 'grid';
}

const DocumentCard = ({ wsId, document, mode }: Props) => {
  const { id, name, content, created_at } = document;
  const href = id ? `/${wsId}/documents/${id}` : '';

  const { lang } = useTranslation();

  const creationDate = moment(created_at).locale(lang).fromNow();

  return (
    <Link
      href={href}
      key={`doc-${id}`}
      className={`flex ${
        mode === 'list' ? 'items-center gap-4' : 'flex-col'
      } relative flex justify-between rounded-lg border border-zinc-300 bg-zinc-500/5 p-4 transition hover:bg-zinc-500/10 dark:border-zinc-800/80 dark:bg-zinc-900 dark:hover:bg-zinc-800/80`}
    >
      <div>
        <p className="line-clamp-1 font-semibold lg:text-lg xl:text-xl">
          {name || 'Untitled Document'}
        </p>

        {content && (
          <>
            <Divider className="my-2" />

            <p className="text-zinc-700 dark:text-zinc-400">
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
        <div className="flex max-w-full items-center gap-1 rounded-lg bg-blue-500/10 px-2 py-1.5 text-blue-600 dark:bg-blue-300/10 dark:text-blue-300">
          <DocumentPlusIcon className="w-5 flex-none" />
          <div className="line-clamp-1">{creationDate}</div>
        </div>
      </div>
    </Link>
  );
};

export default DocumentCard;
