import { Divider } from '@mantine/core';
import Link from 'next/link';
import { Prescription } from '../../types/primitives/Prescription';
import moment from 'moment';
import { WorkspaceUser } from '../../types/primitives/WorkspaceUser';
import useSWR from 'swr';
import { getGender } from '../../utils/gender-helper';
import { useWorkspaces } from '../../hooks/useWorkspaces';

interface Props {
  prescription: Prescription;

  showGender?: boolean;
  showPhone?: boolean;
  showAddress?: boolean;
  showTime?: boolean;
  showStatus?: boolean;
  showAmount?: boolean;
  showPrice?: boolean;
  showCreator?: boolean;
}

const PrescriptionCard = ({
  prescription,

  showGender = false,
  showPhone = false,
  showAddress = false,
  showTime = false,
  showStatus = false,
  showAmount = false,
  showPrice = false,
  showCreator = false,
}: Props) => {
  const { ws } = useWorkspaces();

  const patientApiPath = `/api/workspaces/${ws?.id}/users/${prescription.patient_id}`;
  const { data: patient } = useSWR<WorkspaceUser>(
    ws?.id && prescription.patient_id ? patientApiPath : null
  );

  const creatorApiPath = `/api/users/${prescription.creator_id}`;
  const { data: creator } = useSWR(
    showCreator && ws?.id && prescription.creator_id ? creatorApiPath : null
  );

  const itemsApiPath = `/api/workspaces/${ws?.id}/healthcare/prescriptions/${prescription.id}/items`;
  const { data: items } = useSWR<{
    count: number;
  }>(showAmount && ws?.id && prescription.id ? itemsApiPath : null);

  if (!ws) return null;

  const showStatusInfo = showTime || showCreator || showStatus;
  const showExtraInfo = showAmount || showPrice;

  return (
    <Link
      href={`/${ws.id}/healthcare/prescriptions/${prescription.id}`}
      className="group flex flex-col items-center justify-center rounded-lg border border-zinc-700/80 bg-zinc-800/70 text-center transition hover:bg-zinc-800"
    >
      <div className="flex h-full w-full flex-col">
        <div className="flex h-full flex-col items-center justify-center p-4 text-center">
          <div className="line-clamp-1 font-semibold tracking-wide">
            {prescription?.patient_id ? patient?.name : 'Khách vãng lai'}{' '}
            {showGender && patient?.gender && (
              <span className="lowercase text-orange-300">
                ({getGender(patient.gender)})
              </span>
            )}
          </div>
          {showPhone && prescription?.patient_id && (
            <div className="line-clamp-1 font-semibold text-zinc-400/70">
              {patient?.phone || 'Chưa có số điện thoại'}
            </div>
          )}
        </div>
      </div>

      {(showStatusInfo || showExtraInfo) && (
        <Divider className="w-full border-zinc-700" />
      )}

      {showStatusInfo && (
        <div className="flex w-full flex-col items-center justify-center gap-2 p-2">
          {showCreator && (
            <div className="line-clamp-2 w-full rounded border border-cyan-300/20 bg-cyan-300/10 px-4 py-0.5 font-semibold text-cyan-300">
              Người tạo -{' '}
              {prescription.creator_id
                ? creator?.display_name || 'Không có tên'
                : 'Không xác định'}
            </div>
          )}

          {showTime && (
            <div className="line-clamp-2 w-full rounded border border-zinc-300/20 bg-zinc-300/10 px-4 py-0.5 font-semibold text-zinc-300">
              Tạo lúc{' '}
              {moment(prescription?.created_at).format('HH:mm, DD/MM/YYYY')}
            </div>
          )}

          {showStatus && (
            <div
              className={`line-clamp-2 w-full rounded border px-4 py-0.5 font-semibold ${
                prescription?.completed_at
                  ? 'border-green-300/20 bg-green-300/10 text-green-300'
                  : 'border-red-300/20 bg-red-300/10 text-red-300'
              }`}
            >
              {prescription?.completed_at
                ? `Hoàn tất lúc ${moment(prescription?.completed_at).format(
                    'HH:mm, DD/MM/YYYY'
                  )}`
                : 'Chờ đóng đơn'}
            </div>
          )}
        </div>
      )}

      {showStatusInfo && showExtraInfo && (
        <Divider className="w-full border-zinc-700" />
      )}

      {showExtraInfo && (
        <div className="flex w-full flex-col items-center justify-center gap-2 p-2">
          {showAmount && (
            <div className="line-clamp-1 w-full rounded border border-green-300/20 bg-green-300/10 px-4 py-0.5 font-semibold text-green-300">
              {Intl.NumberFormat('vi-VN', {
                style: 'decimal',
              }).format(items?.count || 0)}
              {' sản phẩm'}
            </div>
          )}

          {showPrice && (
            <div className="line-clamp-1 w-full rounded border border-blue-300/20 bg-blue-300/10 px-4 py-0.5 font-semibold text-blue-300">
              {Intl.NumberFormat('vi-VN', {
                style: 'currency',
                currency: 'VND',
              }).format(
                (prescription?.price || 0) + (prescription?.price_diff || 0)
              )}
            </div>
          )}
        </div>
      )}

      {showAddress && prescription?.patient_id && (
        <>
          <Divider variant="dashed" className="w-full border-zinc-700" />
          <div className="m-2 h-full w-full px-2">
            <div className="flex h-full items-center justify-center rounded border border-purple-300/20 bg-purple-300/10 p-2 font-semibold text-purple-300">
              {patient?.address || 'Chưa có địa chỉ'}
            </div>
          </div>
        </>
      )}
    </Link>
  );
};

export default PrescriptionCard;
