import { Workspace } from '@tutur3u/types/primitives/Workspace';
import { Separator } from '@tutur3u/ui/components/ui/separator';
import moment from 'moment';

interface Props {
  ws: Workspace;
}

const WorkspaceCard = ({ ws }: Props) => {
  return (
    <div className="group flex flex-col items-center justify-center rounded-lg border border-border bg-zinc-500/5 text-center transition hover:bg-zinc-500/10 dark:border-zinc-700/80 dark:bg-zinc-800/70 dark:hover:bg-zinc-800">
      <div className="flex h-full w-full flex-col">
        <div className="flex h-full flex-col items-center justify-center p-2 text-center">
          <div className="line-clamp-1 font-semibold tracking-wide">
            {ws.name}
          </div>
        </div>
      </div>

      <Separator className="w-full border-border dark:border-zinc-700" />
      <div className="m-2 mb-0 h-full w-full px-2">
        <div className="flex h-full items-center justify-center rounded border border-purple-500/20 bg-purple-500/10 p-2 font-semibold text-purple-600 dark:border-purple-300/20 dark:bg-purple-300/10 dark:text-purple-300">
          {(ws?.handle && `@${ws?.handle}`) || 'Chưa có tên đăng nhập'}
        </div>
      </div>
      <div className="m-2 h-full w-full px-2">
        <div className="flex h-full items-center justify-center rounded border border-green-500/20 bg-green-500/10 p-2 font-semibold text-green-600 dark:border-green-300/20 dark:bg-green-300/10 dark:text-green-300">
          Created at {moment(ws?.created_at).format('HH:mm, DD/MM/YYYY')}
        </div>
      </div>
    </div>
  );
};

export default WorkspaceCard;
