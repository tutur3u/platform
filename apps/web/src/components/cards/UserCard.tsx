import { Divider } from '@mantine/core';
import Link from 'next/link';
import { WorkspaceUser } from '../../types/primitives/WorkspaceUser';
import { getGender } from '../../utils/gender-helper';
import { useWorkspaces } from '../../hooks/useWorkspaces';

interface Props {
  user: WorkspaceUser;
  showGender?: boolean;
  showPhone?: boolean;
  showAddress?: boolean;
}

const PatientCard = ({
  user,
  showGender = false,
  showPhone = false,
  showAddress = false,
}: Props) => {
  const { ws } = useWorkspaces();
  if (!ws) return null;

  return (
    <Link
      href={`/${ws.id}/users/${user.id}`}
      className="group flex flex-col items-center justify-center rounded-lg border border-zinc-700/80 bg-zinc-800/70 text-center transition hover:bg-zinc-800"
    >
      <div className="flex h-full w-full flex-col">
        <div className="flex h-full flex-col items-center justify-center p-2 text-center">
          <div className="line-clamp-1 font-semibold tracking-wide">
            {user.name}{' '}
            {showGender && user.gender && (
              <span className="lowercase text-orange-300">
                ({getGender(user.gender)})
              </span>
            )}
          </div>
          {showPhone && (
            <div className="line-clamp-1 font-semibold text-zinc-400/70">
              {user?.phone || 'Chưa có số điện thoại'}
            </div>
          )}
        </div>
      </div>

      {showAddress && (
        <>
          <Divider variant="dashed" className="w-full border-zinc-700" />
          <div className="m-2 h-full w-full px-2">
            <div className="flex h-full items-center justify-center rounded border border-purple-300/20 bg-purple-300/10 p-2 font-semibold text-purple-300">
              {user?.address || 'Chưa có địa chỉ'}
            </div>
          </div>
        </>
      )}
    </Link>
  );
};

export default PatientCard;
