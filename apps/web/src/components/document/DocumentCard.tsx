import { WorkspaceDocument } from '@/types/db';
import { Separator } from '@repo/ui/components/ui/separator';
import { FilePlus } from 'lucide-react';
import moment from 'moment';
import 'moment/locale/vi';
import { useLocale } from 'next-intl';
import Link from 'next/link';

interface Props {
  wsId: string;
  document: Partial<WorkspaceDocument>;
}

const DocumentCard = ({ wsId: _, document }: Props) => {
  const { id, name, content, created_at } = document;
  // const href = id ? `/${wsId}/documents/${id}` : '';

  const locale = useLocale();

  const creationDate = moment(created_at).locale(locale).fromNow();

  return (
    <Link
      // href={href}
      href="#"
      key={`doc-${id}`}
      className="border-border relative grid cursor-default gap-4 rounded-lg border p-4 transition"
    >
      <div>
        <p className="line-clamp-1 font-semibold lg:text-lg xl:text-xl">
          {name || 'Untitled Document'}
        </p>

        {content && (
          <>
            <Separator className="my-2" />
            <div
              className="prose text-foreground line-clamp-3 opacity-80"
              dangerouslySetInnerHTML={{
                __html: document.content || '',
              }}
            />
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 justify-self-start text-sm font-semibold">
        <div className="bg-dynamic-blue/5 border-dynamic-blue/20 text-dynamic-blue flex w-full max-w-full items-center gap-1 rounded-lg border px-2 py-1.5">
          <FilePlus className="w-5 flex-none" />
          <div className="line-clamp-1">{creationDate}</div>
        </div>
      </div>
    </Link>
  );
};

export default DocumentCard;
