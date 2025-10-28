import type { Workspace } from '@tuturuuu/types';
import { Separator } from '@tuturuuu/ui/separator';
import moment from 'moment';

interface Props {
  ws: Workspace;
}

const WorkspaceCard = ({ ws }: Props) => {
  return (
    <div className="group flex flex-col items-center justify-center rounded-lg border border-border bg-foreground/5 text-center transition hover:bg-foreground/10">
      <div className="flex h-full w-full flex-col">
        <div className="flex h-full flex-col items-center justify-center p-2 text-center">
          <div className="line-clamp-1 font-semibold tracking-wide">
            {ws.name}
          </div>
        </div>
      </div>

      <Separator className="w-full border-border" />
      <div className="m-2 mb-0 h-full w-full px-2">
        <div className="flex h-full items-center justify-center rounded border border-dynamic-purple/20 bg-dynamic-purple/10 p-2 font-semibold text-dynamic-purple">
          {(ws?.handle && `@${ws?.handle}`) || 'Chưa có tên đăng nhập'}
        </div>
      </div>
      <div className="m-2 h-full w-full px-2">
        <div className="flex h-full items-center justify-center rounded border border-dynamic-green/20 bg-dynamic-green/10 p-2 font-semibold text-dynamic-green">
          Created at {moment(ws?.created_at).format('HH:mm, DD/MM/YYYY')}
        </div>
      </div>
    </div>
  );
};

export default WorkspaceCard;
