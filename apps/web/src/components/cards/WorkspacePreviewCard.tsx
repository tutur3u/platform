import { Workspace } from '@/types/primitives/Workspace';
import Link from 'next/link';

interface Props {
  ws: Workspace;
}

const WorkspacePreviewCard = ({ ws }: Props) => {
  const isRoot = ws?.id === '00000000-0000-0000-0000-000000000000';

  return (
    <div>
      <Link
        href={`/${ws.id}`}
        className={`${
          isRoot
            ? 'text-purple-200 hover:text-purple-300'
            : 'text-zinc-300 hover:text-blue-200'
        } text-2xl font-semibold transition duration-150`}
      >
        {ws?.name || `Unnamed Workspace`}
      </Link>
    </div>
  );
};

export default WorkspacePreviewCard;
