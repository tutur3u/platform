import { useWorkspaces } from '@/hooks/useWorkspaces';
import { Checkup } from '@/types/primitives/Checkup';
import { Diagnosis } from '@/types/primitives/Diagnosis';
import { User } from '@/types/primitives/User';
import { WorkspaceUser } from '@/types/primitives/WorkspaceUser';
import { getGender } from '@/utils/gender-helper';
import { Divider } from '@mantine/core';
import moment from 'moment';
import Link from 'next/link';
import useSWR from 'swr';

interface Props {
  checkup: Checkup;
  showGender?: boolean;
  showPhone?: boolean;
  showAddress?: boolean;
  showTime?: boolean;
  showStatus?: boolean;
  showDiagnosis?: boolean;
  showCreator?: boolean;
}

const CheckupCard = ({
  checkup,
  showGender = false,
  showPhone = false,
  showAddress = false,
  showTime = false,
  showStatus = false,
  showDiagnosis = false,
  showCreator = false,
}: Props) => {
  const { ws } = useWorkspaces();

  const userApiPath = `/api/workspaces/${ws?.id}/users/${checkup.patient_id}`;
  const diagnosisApiPath = `/api/workspaces/${ws?.id}/healthcare/diagnoses/${checkup.diagnosis_id}`;
  const creatorApiPath = `/api/users/${checkup.creator_id}`;

  const { data: user } = useSWR<WorkspaceUser>(
    ws?.id && checkup.patient_id ? userApiPath : null
  );

  const { data: diagnosis } = useSWR<Diagnosis>(
    showDiagnosis && ws?.id && checkup.diagnosis_id ? diagnosisApiPath : null
  );

  const { data: creator } = useSWR<User>(
    showCreator && ws?.id && checkup.creator_id ? creatorApiPath : null
  );

  if (!ws) return null;

  const showStatusInfo = showTime || showCreator || showStatus;

  return (
    <Link
      href={`/${ws.id}/healthcare/checkups/${checkup.id}`}
      className="border-border group flex flex-col items-center justify-center rounded-lg border bg-zinc-500/5 text-center transition hover:bg-zinc-500/10 dark:border-zinc-700/80 dark:bg-zinc-800/70 dark:hover:bg-zinc-800"
    >
      <div className="flex h-full w-full flex-col">
        <div className="flex h-full flex-col items-center justify-center p-2 text-center">
          <div className="line-clamp-1 font-semibold tracking-wide">
            {checkup?.patient_id ? user?.name : 'Khách vãng lai'}{' '}
            {showGender && user?.gender && (
              <span className="lowercase text-orange-600 dark:text-orange-300">
                ({getGender(user.gender)})
              </span>
            )}
          </div>
          {showPhone && checkup?.patient_id && (
            <div className="text-foreground/80 line-clamp-1 font-semibold dark:text-zinc-400/70">
              {user?.phone || 'Chưa có số điện thoại'}
            </div>
          )}
        </div>
      </div>

      {showStatusInfo && (
        <Divider className="border-border w-full dark:border-zinc-700" />
      )}

      {showStatusInfo && (
        <div className="flex w-full flex-col items-center justify-center gap-2 p-2">
          {showCreator && (
            <div className="line-clamp-2 w-full rounded border border-cyan-300/20 bg-cyan-300/10 px-4 py-0.5 font-semibold text-cyan-300">
              Người tạo -{' '}
              {checkup.creator_id
                ? creator?.display_name || 'Không có tên'
                : 'Không xác định'}
            </div>
          )}

          {showTime && (
            <div className="line-clamp-2 w-full rounded border border-zinc-300/20 bg-zinc-300/10 px-4 py-0.5 font-semibold text-zinc-300">
              Tạo lúc {moment(checkup?.created_at).format('HH:mm, DD/MM/YYYY')}
            </div>
          )}

          {showStatus && (
            <div
              className={`line-clamp-2 w-full rounded border px-4 py-0.5 font-semibold ${
                checkup?.completed_at
                  ? 'border-green-300/20 bg-green-300/10 text-green-300'
                  : 'border-pink-300/20 bg-pink-300/10 text-pink-300'
              }`}
            >
              {checkup?.completed_at
                ? `Hoàn tất lúc ${moment(checkup?.completed_at).format(
                    'HH:mm, DD/MM/YYYY'
                  )}`
                : checkup?.next_checkup_at && !checkup?.next_checked
                  ? `Hẹn tái khám lúc ${moment(checkup?.next_checkup_at).format(
                      'HH:mm, DD/MM/YYYY'
                    )}`
                  : checkup?.checkup_at && !checkup?.checked
                    ? `Đang chờ khám lúc ${moment(checkup?.checkup_at).format(
                        'HH:mm, DD/MM/YYYY'
                      )}`
                    : 'Trạng thái không xác định'}
            </div>
          )}
        </div>
      )}

      {showStatusInfo && (
        <Divider className="border-border w-full dark:border-zinc-700" />
      )}

      {showDiagnosis && (
        <div className="flex w-full flex-col items-center justify-center gap-2 p-2">
          {showDiagnosis && (
            <div className="line-clamp-1 w-full rounded border border-orange-300/20 bg-orange-300/10 px-4 py-0.5 font-semibold text-orange-300">
              {diagnosis?.name || 'Chưa có chẩn đoán'}
            </div>
          )}

          {/* {showPrice && (
            <div className="line-clamp-1 w-full rounded border border-blue-300/20 bg-blue-300/10 px-4 py-0.5 font-semibold text-blue-300">
              {Intl.NumberFormat('vi-VN', {
                style: 'currency',
                currency: 'VND',
              }).format((checkup?.price || 0) + (checkup?.total_diff || 0))}
            </div>
          )} */}
        </div>
      )}

      {showAddress && checkup?.patient_id && (
        <>
          <Divider
            variant="dashed"
            className="border-border w-full dark:border-zinc-700"
          />
          <div className="m-2 h-full w-full px-2">
            <div className="flex h-full items-center justify-center rounded border border-purple-500/20 bg-purple-500/10 p-2 font-semibold text-purple-600 dark:border-purple-300/20 dark:bg-purple-300/10 dark:text-purple-300">
              {user?.address || 'Chưa có địa chỉ'}
            </div>
          </div>
        </>
      )}
    </Link>
  );
};

export default CheckupCard;
