import { Select } from '@mantine/core';
import { useWorkspaces } from '../../hooks/useWorkspaces';
import { useRouter } from 'next/router';

interface Props {
  showLabel?: boolean;
  onChange?: () => void;
  className?: string;
}

const WorkspaceSelector = ({ showLabel, onChange, className }: Props) => {
  const router = useRouter();

  const { ws, workspaces, workspacesLoading, setCachedWsId } = useWorkspaces();

  const hasWorkspaces = workspaces && workspaces.length > 0;

  const wsOptions = hasWorkspaces
    ? workspaces.map((o) => ({
        value: o.id,
        label: o?.name || 'Tổ chức không tên',
      }))
    : [
        {
          value: '',
          label: 'No workspace',
        },
      ];

  if (!hasWorkspaces)
    return (
      <div className="flex w-full cursor-not-allowed items-center justify-center gap-2 rounded border border-zinc-300 bg-zinc-500/5 p-2 text-sm text-zinc-500 transition dark:border-zinc-800 dark:bg-zinc-800/80">
        <div className="line-clamp-1 font-bold">
          {workspacesLoading ? 'Đang tải...' : 'Chưa là thành viên'}
        </div>
      </div>
    );

  return (
    <Select
      label={showLabel ? 'Tổ chức' : undefined}
      data={wsOptions}
      value={ws?.id || ''}
      onChange={(wsId) => {
        if (onChange) onChange();
        if (!wsId) return;

        // replace wsId in url if there is one
        if (router?.query?.wsId)
          router.push(
            router.asPath.replace(
              new RegExp(`/${router.query.wsId}`),
              `/${wsId}`
            )
          );
        // otherwise, redirect to /wsId
        else setCachedWsId(wsId);
      }}
      disabled={workspacesLoading || !hasWorkspaces}
      classNames={{
        label: 'mb-1',
        item: 'text-sm',
        input: 'font-semibold',
      }}
      className={className}
    />
  );
};

export default WorkspaceSelector;
