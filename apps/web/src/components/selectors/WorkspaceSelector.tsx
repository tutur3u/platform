import { Select } from '@mantine/core';
import { useWorkspaces } from '../../hooks/useWorkspaces';
import { useRouter } from 'next/router';
import { BuildingOffice2Icon } from '@heroicons/react/24/solid';
import { openModal } from '@mantine/modals';
import WorkspaceEditForm from '../forms/WorkspaceEditForm';

interface Props {
  showLabel?: boolean;
  onChange?: () => void;
  className?: string;
}

const WorkspaceSelector = ({ showLabel, onChange, className }: Props) => {
  const router = useRouter();

  const { ws, workspaces, workspacesLoading, createWorkspace } =
    useWorkspaces();

  const hasWorkspaces = workspaces && workspaces.length > 0;

  const wsOptions = hasWorkspaces
    ? workspaces.map((o) => ({
        value: o.id,
        label: o?.name || 'Unnamed Workspace',
      }))
    : [
        {
          value: '',
          label: 'No workspace',
        },
      ];

  const showEditWorkspaceModal = () => {
    openModal({
      title: <div className="font-semibold">New workspace</div>,
      centered: true,
      children: <WorkspaceEditForm onSubmit={createWorkspace} />,
    });
  };

  if (!workspacesLoading && !hasWorkspaces)
    return (
      <button
        className="flex w-full items-center justify-center gap-2 rounded border border-zinc-800 bg-zinc-800/80 p-2 text-sm font-semibold text-zinc-400 transition hover:bg-zinc-300/10 hover:text-zinc-200"
        onClick={showEditWorkspaceModal}
      >
        <BuildingOffice2Icon className="w-4" />
        <div className="line-clamp-1">Create workspace</div>
      </button>
    );

  return (
    <Select
      label={showLabel ? 'Workspace' : undefined}
      data={wsOptions}
      value={ws?.id}
      onChange={(wsId) => {
        if (onChange) onChange();

        // replace wsId in url
        router.push(
          router.asPath.replace(new RegExp(`/${router.query.wsId}`), `/${wsId}`)
        );
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
