import { WorkspaceDocument } from '@/types/db';
import { FilePlus } from 'lucide-react';
import moment from 'moment';
import 'moment/locale/vi';
import { useLocale } from 'next-intl';
import Link from 'next/link';

interface Props {
  wsId: string;
  document: Partial<WorkspaceDocument>;
}

export const DocumentCard = ({ wsId, document }: Props) => {
  const { id, name, created_at } = document;
  const href = id ? `/${wsId}/documents/${id}` : '#';

  const locale = useLocale();
  const creationDate = moment(created_at).locale(locale).fromNow();

  return (
    <Link
      href={href}
      key={`doc-${id}`}
      className="relative grid cursor-pointer gap-4 rounded-lg border border-border p-4 transition hover:bg-accent"
    >
      <div>
        <p className="line-clamp-1 font-semibold lg:text-lg xl:text-xl">
          {name || 'Untitled Document'}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 justify-self-start text-sm font-semibold">
        <div className="flex w-full max-w-full items-center gap-1 rounded-lg border border-dynamic-blue/20 bg-dynamic-blue/5 px-2 py-1.5 text-dynamic-blue">
          <FilePlus className="w-5 flex-none" />
          <div className="line-clamp-1">{creationDate}</div>
        </div>
      </div>
    </Link>
  );
};
