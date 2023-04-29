import { JsonInput, Loader } from '@mantine/core';
import { AuditLog } from '../../types/primitives/AuditLog';
import { User } from '../../types/primitives/User';
import useSWR from 'swr';

interface Props {
  data: AuditLog;
  isExpanded: boolean;
}

const AuditSmartContent = ({ data, isExpanded }: Props) => {
  const userId = data?.record?.user_id || data?.old_record?.user_id || null;
  const userApi = userId ? `/api/users/${userId}` : null;

  const { data: user, error } = useSWR<User>(userApi);
  const isLoading = (isExpanded && userId && !user && !error) || false;

  if (
    data.table_name === 'workspace_boards' ||
    data.table_name === 'workspace_documents' ||
    data.table_name === 'workspace_teams' ||
    data.table_name === 'product_categories' ||
    data.table_name === 'inventory_units' ||
    data.table_name === 'inventory_suppliers' ||
    data.table_name === 'inventory_warehouses' ||
    data.table_name === 'workspace_user_roles'
  )
    return (
      <div className="flex flex-col rounded border border-zinc-300/10 bg-zinc-800 p-4">
        <p className="text-zinc-400">
          {data.op === 'INSERT' && data?.record?.name != null && (
            <>
              • Thiết lập tên thành{' '}
              <span className="font-semibold text-zinc-200">
                {data.record.name}
              </span>
            </>
          )}

          {data.op === 'UPDATE' &&
            data?.record?.name != null &&
            data?.old_record?.name != null &&
            data?.record?.name != data?.old_record?.name && (
              <>
                • Đổi tên từ{' '}
                <span className="font-semibold text-zinc-200">
                  {data.old_record.name}
                </span>{' '}
                sang{' '}
                <span className="font-semibold text-zinc-200">
                  {data.record.name}
                </span>
              </>
            )}

          {data.op === 'DELETE' && data?.old_record?.name != null && (
            <>
              • Xóa{' '}
              <span className="font-semibold text-zinc-200">
                {data.old_record.name}
              </span>
            </>
          )}
        </p>
      </div>
    );

  if (data.table_name === 'transaction_categories')
    return (
      <div className="flex flex-col rounded border border-zinc-300/10 bg-zinc-800 p-4">
        <p className="text-zinc-400">
          {data.op === 'INSERT' && data?.record?.name != null && (
            <p>
              • Thiết lập tên thành{' '}
              <span className="font-semibold text-zinc-200">
                {data.record.name}
              </span>
            </p>
          )}

          {data.op === 'INSERT' && data?.record?.is_expense != null && (
            <p>
              • Thiết lập loại chi phí thành{' '}
              <span className="font-semibold text-zinc-200">
                {data.record.is_expense ? 'Chi phí' : 'Thu nhập'}
              </span>
            </p>
          )}

          {data.op === 'UPDATE' &&
            data?.record?.name != null &&
            data?.old_record?.name != null &&
            data?.record?.name != data?.old_record?.name && (
              <p>
                • Đổi tên từ{' '}
                <span className="font-semibold text-zinc-200">
                  {data.old_record.name}
                </span>{' '}
                sang{' '}
                <span className="font-semibold text-zinc-200">
                  {data.record.name}
                </span>
              </p>
            )}

          {data.op === 'UPDATE' &&
            data?.record?.is_expense != null &&
            data?.old_record?.is_expense != null &&
            data?.record?.is_expense != data?.old_record?.is_expense && (
              <p>
                • Đổi loại chi phí từ{' '}
                <span className="font-semibold text-zinc-200">
                  {data.old_record.is_expense ? 'Chi phí' : 'Thu nhập'}
                </span>{' '}
                sang{' '}
                <span className="font-semibold text-zinc-200">
                  {data.record.is_expense ? 'Chi phí' : 'Thu nhập'}
                </span>
              </p>
            )}

          {data.op === 'DELETE' && data?.old_record?.name != null && (
            <>
              • Xóa{' '}
              <span className="font-semibold text-zinc-200">
                {data.old_record.name}
              </span>
            </>
          )}
        </p>
      </div>
    );

  if (data.table_name === 'healthcare_vitals')
    return (
      <div className="flex flex-col rounded border border-zinc-300/10 bg-zinc-800 p-4">
        <p className="text-zinc-400">
          {data.op === 'INSERT' && data?.record?.name != null && (
            <p>
              • Thiết lập tên thành{' '}
              <span className="font-semibold text-zinc-200">
                {data.record.name}
              </span>
            </p>
          )}

          {data.op === 'INSERT' && data?.record?.unit != null && (
            <p>
              • Thiết lập đơn vị thành{' '}
              <span className="font-semibold text-zinc-200">
                {data.record.unit}
              </span>
            </p>
          )}

          {data.op === 'UPDATE' &&
            data?.record?.name != null &&
            data?.old_record?.name != null &&
            data?.record?.name != data?.old_record?.name && (
              <p>
                • Đổi tên từ{' '}
                <span className="font-semibold text-zinc-200">
                  {data.old_record.name}
                </span>{' '}
                sang{' '}
                <span className="font-semibold text-zinc-200">
                  {data.record.name}
                </span>
              </p>
            )}

          {data.op === 'UPDATE' &&
            data?.record?.unit != null &&
            data?.old_record?.unit != null &&
            data?.record?.unit != data?.old_record?.unit && (
              <p>
                • Đổi đơn vị từ{' '}
                <span className="font-semibold text-zinc-200">
                  {data.old_record.unit}
                </span>{' '}
                sang{' '}
                <span className="font-semibold text-zinc-200">
                  {data.record.unit}
                </span>
              </p>
            )}

          {data.op === 'DELETE' && data?.old_record?.name != null && (
            <>
              • Xóa{' '}
              <span className="font-semibold text-zinc-200">
                {data.old_record.name}
              </span>
            </>
          )}
        </p>
      </div>
    );

  if (data.table_name === 'workspace_products')
    return (
      <div className="flex flex-col rounded border border-zinc-300/10 bg-zinc-800 p-4">
        <p className="text-zinc-400">
          {data.op === 'INSERT' && data?.record?.name != null && (
            <p>
              • Thiết lập tên thành{' '}
              <span className="font-semibold text-zinc-200">
                {data.record.name}
              </span>
            </p>
          )}

          {data.op === 'INSERT' && data?.record?.manufacturer != null && (
            <p>
              • Thiết lập đơn vị sản xuất thành{' '}
              <span className="font-semibold text-zinc-200">
                {data.record.manufacturer}
              </span>
            </p>
          )}

          {data.op === 'INSERT' && data?.record?.usage != null && (
            <p>
              • Thiết lập cách sử dụng thành{' '}
              <span className="font-semibold text-zinc-200">
                {data.record.usage}
              </span>
            </p>
          )}

          {data.op === 'INSERT' && data?.record?.description != null && (
            <p>
              • Thiết lập mô tả thành{' '}
              <span className="font-semibold text-zinc-200">
                {data.record.description}
              </span>
            </p>
          )}

          {data.op === 'UPDATE' &&
            data?.record?.name != null &&
            data?.old_record?.name != null &&
            data?.record?.name != data?.old_record?.name && (
              <p>
                • Đổi tên từ{' '}
                <span className="font-semibold text-zinc-200">
                  {data.old_record.name}
                </span>{' '}
                sang{' '}
                <span className="font-semibold text-zinc-200">
                  {data.record.name}
                </span>
              </p>
            )}

          {data.op === 'UPDATE' &&
            data?.record?.manufacturer != null &&
            data?.old_record?.manufacturer != null &&
            data?.record?.manufacturer != data?.old_record?.manufacturer && (
              <p>
                • Đổi đơn vị sản xuất từ{' '}
                <span className="font-semibold text-zinc-200">
                  {data.old_record.manufacturer}
                </span>{' '}
                sang{' '}
                <span className="font-semibold text-zinc-200">
                  {data.record.manufacturer}
                </span>
              </p>
            )}

          {data.op === 'UPDATE' &&
            data?.record?.usage != null &&
            data?.old_record?.usage != null &&
            data?.record?.usage != data?.old_record?.usage && (
              <p>
                • Đổi cách sử dụng từ{' '}
                <span className="font-semibold text-zinc-200">
                  {data.old_record.usage}
                </span>{' '}
                sang{' '}
                <span className="font-semibold text-zinc-200">
                  {data.record.usage}
                </span>
              </p>
            )}

          {data.op === 'UPDATE' &&
            data?.record?.description != null &&
            data?.old_record?.description != null &&
            data?.record?.description != data?.old_record?.description && (
              <p>
                • Đổi mô tả từ{' '}
                <span className="font-semibold text-zinc-200">
                  {data.old_record.description}
                </span>{' '}
                sang{' '}
                <span className="font-semibold text-zinc-200">
                  {data.record.description}
                </span>
              </p>
            )}

          {data.op === 'DELETE' && data?.old_record?.name != null && (
            <>
              • Xóa{' '}
              <span className="font-semibold text-zinc-200">
                {data.old_record.name}
              </span>
            </>
          )}
        </p>
      </div>
    );

  if (
    data.table_name === 'healthcare_diagnoses' ||
    data.table_name === 'healthcare_vital_groups'
  )
    return (
      <div className="flex flex-col rounded border border-zinc-300/10 bg-zinc-800 p-4">
        <p className="text-zinc-400">
          {data.op === 'INSERT' && data?.record?.name != null && (
            <p>
              • Thiết lập tên thành{' '}
              <span className="font-semibold text-zinc-200">
                {data.record.name}
              </span>
            </p>
          )}

          {data.op === 'INSERT' && data?.record?.note != null && (
            <p>
              • Thiết lập ghi chú thành{' '}
              <span className="font-semibold text-zinc-200">
                {data.record.note}
              </span>
            </p>
          )}

          {data.op === 'INSERT' && data?.record?.description != null && (
            <p>
              • Thiết lập mô tả thành{' '}
              <span className="font-semibold text-zinc-200">
                {data.record.description}
              </span>
            </p>
          )}

          {data.op === 'UPDATE' &&
            data?.record?.name != null &&
            data?.old_record?.name != null &&
            data?.record?.name != data?.old_record?.name && (
              <p>
                • Đổi tên từ{' '}
                <span className="font-semibold text-zinc-200">
                  {data.old_record.name}
                </span>{' '}
                sang{' '}
                <span className="font-semibold text-zinc-200">
                  {data.record.name}
                </span>
              </p>
            )}

          {data.op === 'UPDATE' &&
            data?.record?.note != null &&
            data?.old_record?.note != null &&
            data?.record?.note != data?.old_record?.note && (
              <p>
                • Đổi ghi chú từ{' '}
                <span className="font-semibold text-zinc-200">
                  {data.old_record.note}
                </span>{' '}
                sang{' '}
                <span className="font-semibold text-zinc-200">
                  {data.record.note}
                </span>
              </p>
            )}

          {data.op === 'UPDATE' &&
            data?.record?.description != null &&
            data?.old_record?.description != null &&
            data?.record?.description != data?.old_record?.description && (
              <p>
                • Đổi mô tả từ{' '}
                <span className="font-semibold text-zinc-200">
                  {data.old_record.description}
                </span>{' '}
                sang{' '}
                <span className="font-semibold text-zinc-200">
                  {data.record.description}
                </span>
              </p>
            )}

          {data.op === 'DELETE' && data?.old_record?.name != null && (
            <>
              • Xóa{' '}
              <span className="font-semibold text-zinc-200">
                {data.old_record.name}
              </span>
            </>
          )}
        </p>
      </div>
    );

  if (data.table_name === 'workspace_users')
    return (
      <div className="flex flex-col rounded border border-zinc-300/10 bg-zinc-800 p-4">
        <p className="text-zinc-400">
          {data.op === 'INSERT' && data?.record?.name != null && (
            <p>
              • Thiết lập tên thành{' '}
              <span className="font-semibold text-zinc-200">
                {data.record.name}
              </span>
            </p>
          )}

          {data.op === 'INSERT' && data?.record?.note != null && (
            <p>
              • Thiết lập ghi chú thành{' '}
              <span className="font-semibold text-zinc-200">
                {data.record.note}
              </span>
            </p>
          )}

          {data.op === 'INSERT' && data?.record?.email != null && (
            <p>
              • Thiết lập email thành{' '}
              <span className="font-semibold text-zinc-200">
                {data.record.email}
              </span>
            </p>
          )}

          {data.op === 'INSERT' && data?.record?.phone != null && (
            <p>
              • Thiết lập số điện thoại thành{' '}
              <span className="font-semibold text-zinc-200">
                {data.record.phone}
              </span>
            </p>
          )}

          {data.op === 'INSERT' && data?.record?.gender != null && (
            <p>
              • Thiết lập giới tính thành{' '}
              <span className="font-semibold text-zinc-200">
                {data.record.gender}
              </span>
            </p>
          )}

          {data.op === 'INSERT' && data?.record?.address != null && (
            <p>
              • Thiết lập địa chỉ thành{' '}
              <span className="font-semibold text-zinc-200">
                {data.record.address}
              </span>
            </p>
          )}

          {data.op === 'INSERT' && data?.record?.balance != null && (
            <p>
              • Thiết lập số dư thành{' '}
              <span className="font-semibold text-zinc-200">
                {Intl.NumberFormat('vi-VN', {
                  style: 'currency',
                  currency: 'VND',
                }).format(data.record.balance)}
              </span>
            </p>
          )}

          {data.op === 'INSERT' && data?.record?.birthday != null && (
            <p>
              • Thiết lập ngày sinh thành{' '}
              <span className="font-semibold text-zinc-200">
                {data.record.birthday}
              </span>
            </p>
          )}

          {data.op === 'INSERT' && data?.record?.guardian != null && (
            <p>
              • Thiết lập người giám hộ thành{' '}
              <span className="font-semibold text-zinc-200">
                {data.record.guardian}
              </span>
            </p>
          )}

          {data.op === 'INSERT' && data?.record?.ethnicity != null && (
            <p>
              • Thiết lập dân tộc thành{' '}
              <span className="font-semibold text-zinc-200">
                {data.record.ethnicity}
              </span>
            </p>
          )}

          {data.op === 'INSERT' && data?.record?.national_id != null && (
            <p>
              • Thiết lập CMND/CCCD thành{' '}
              <span className="font-semibold text-zinc-200">
                {data.record.national_id}
              </span>
            </p>
          )}

          {data.op === 'UPDATE' &&
            data?.record?.name != null &&
            data?.old_record?.name != null &&
            data?.record?.name != data?.old_record?.name && (
              <p>
                • Đổi tên từ{' '}
                <span className="font-semibold text-zinc-200">
                  {data.old_record.name}
                </span>{' '}
                sang{' '}
                <span className="font-semibold text-zinc-200">
                  {data.record.name}
                </span>
              </p>
            )}

          {data.op === 'UPDATE' &&
            data?.record?.note != null &&
            data?.old_record?.note != null &&
            data?.record?.note != data?.old_record?.note && (
              <p>
                • Đổi ghi chú từ{' '}
                <span className="font-semibold text-zinc-200">
                  {data.old_record.note}
                </span>{' '}
                sang{' '}
                <span className="font-semibold text-zinc-200">
                  {data.record.note}
                </span>
              </p>
            )}

          {data.op === 'UPDATE' &&
            data?.record?.email != null &&
            data?.old_record?.email != null &&
            data?.record?.email != data?.old_record?.email && (
              <p>
                • Đổi email từ{' '}
                <span className="font-semibold text-zinc-200">
                  {data.old_record.email}
                </span>{' '}
                sang{' '}
                <span className="font-semibold text-zinc-200">
                  {data.record.email}
                </span>
              </p>
            )}

          {data.op === 'UPDATE' &&
            data?.record?.phone != null &&
            data?.old_record?.phone != null &&
            data?.record?.phone != data?.old_record?.phone && (
              <p>
                • Đổi số điện thoại từ{' '}
                <span className="font-semibold text-zinc-200">
                  {data.old_record.phone}
                </span>{' '}
                sang{' '}
                <span className="font-semibold text-zinc-200">
                  {data.record.phone}
                </span>
              </p>
            )}

          {data.op === 'UPDATE' &&
            data?.record?.gender != null &&
            data?.old_record?.gender != null &&
            data?.record?.gender != data?.old_record?.gender && (
              <p>
                • Đổi giới tính từ{' '}
                <span className="font-semibold text-zinc-200">
                  {data.old_record.gender}
                </span>{' '}
                sang{' '}
                <span className="font-semibold text-zinc-200">
                  {data.record.gender}
                </span>
              </p>
            )}

          {data.op === 'UPDATE' &&
            data?.record?.address != null &&
            data?.old_record?.address != null &&
            data?.record?.address != data?.old_record?.address && (
              <p>
                • Đổi địa chỉ từ{' '}
                <span className="font-semibold text-zinc-200">
                  {data.old_record.address}
                </span>{' '}
                sang{' '}
                <span className="font-semibold text-zinc-200">
                  {data.record.address}
                </span>
              </p>
            )}

          {data.op === 'UPDATE' &&
            data?.record?.balance != null &&
            data?.old_record?.balance != null &&
            data?.record?.balance != data?.old_record?.balance && (
              <p>
                • Đổi số dư từ{' '}
                <span className="font-semibold text-zinc-200">
                  {Intl.NumberFormat('vi-VN', {
                    style: 'currency',
                    currency: 'VND',
                  }).format(data.old_record.balance)}
                </span>{' '}
                sang{' '}
                <span className="font-semibold text-zinc-200">
                  {Intl.NumberFormat('vi-VN', {
                    style: 'currency',
                    currency: 'VND',
                  }).format(data.record.balance)}
                </span>
              </p>
            )}

          {data.op === 'UPDATE' &&
            data?.record?.birthday != null &&
            data?.old_record?.birthday != null &&
            data?.record?.birthday != data?.old_record?.birthday && (
              <p>
                • Đổi ngày sinh từ{' '}
                <span className="font-semibold text-zinc-200">
                  {data.old_record.birthday}
                </span>{' '}
                sang{' '}
                <span className="font-semibold text-zinc-200">
                  {data.record.birthday}
                </span>
              </p>
            )}

          {data.op === 'UPDATE' &&
            data?.record?.guardian != null &&
            data?.old_record?.guardian != null &&
            data?.record?.guardian != data?.old_record?.guardian && (
              <p>
                • Đổi người giám hộ từ{' '}
                <span className="font-semibold text-zinc-200">
                  {data.old_record.guardian}
                </span>{' '}
                sang{' '}
                <span className="font-semibold text-zinc-200">
                  {data.record.guardian}
                </span>
              </p>
            )}

          {data.op === 'UPDATE' &&
            data?.record?.ethnicity != null &&
            data?.old_record?.ethnicity != null &&
            data?.record?.ethnicity != data?.old_record?.ethnicity && (
              <p>
                • Đổi dân tộc từ{' '}
                <span className="font-semibold text-zinc-200">
                  {data.old_record.ethnicity}
                </span>{' '}
                sang{' '}
                <span className="font-semibold text-zinc-200">
                  {data.record.ethnicity}
                </span>
              </p>
            )}

          {data.op === 'UPDATE' &&
            data?.record?.national_id != null &&
            data?.old_record?.national_id != null &&
            data?.record?.national_id != data?.old_record?.national_id && (
              <p>
                • Đổi CMND/CCCD từ{' '}
                <span className="font-semibold text-zinc-200">
                  {data.old_record.national_id}
                </span>{' '}
                sang{' '}
                <span className="font-semibold text-zinc-200">
                  {data.record.email}
                </span>
              </p>
            )}

          {data.op === 'DELETE' && data?.old_record?.name != null && (
            <>
              • Xóa{' '}
              <span className="font-semibold text-zinc-200">
                {data.old_record.name}
              </span>
            </>
          )}
        </p>
      </div>
    );

  if (data.table_name === 'workspace_wallets')
    return (
      <div className="flex flex-col rounded border border-zinc-300/10 bg-zinc-800 p-4 text-zinc-400">
        {data.op === 'INSERT' && (
          <>
            {data?.record?.name != null && (
              <p>
                • Thiết lập tên nguồn tiền thành{' '}
                <span className="font-semibold text-zinc-200">
                  {data.record.name}
                </span>
              </p>
            )}

            {data?.record?.type != null && (
              <p>
                • Thiết lập loại nguồn tiền thành{' '}
                <span className="font-semibold text-zinc-200">
                  {data.record.type}
                </span>
              </p>
            )}

            {data?.record?.currency != null && (
              <p>
                • Thiết lập loại tiền tệ thành{' '}
                <span className="font-semibold text-zinc-200">
                  {data.record.currency}
                </span>
              </p>
            )}

            {data?.record?.balance != null && (
              <p>
                • Thiết lập số dư nguồn tiền thành{' '}
                <span className="font-semibold text-zinc-200">
                  {Intl.NumberFormat('vi-VN', {
                    style: 'currency',
                    currency: data?.record?.currency || 'USD',
                  }).format(data.record.balance)}
                </span>
              </p>
            )}
          </>
        )}

        {data.op === 'UPDATE' && (
          <>
            {JSON.stringify(data?.record) ===
            JSON.stringify(data?.old_record) ? (
              <p>• Không có thay đổi</p>
            ) : null}

            {data?.record?.name != null &&
              data?.old_record?.name != null &&
              data?.record?.name != data?.old_record?.name && (
                <p>
                  • Đổi tên từ{' '}
                  <span className="font-semibold text-zinc-200">
                    {data.old_record.name}
                  </span>{' '}
                  sang{' '}
                  <span className="font-semibold text-zinc-200">
                    {data.record.name}
                  </span>
                </p>
              )}

            {data?.record?.type != null &&
              data?.old_record?.type != null &&
              data?.record?.type != data?.old_record?.type && (
                <p>
                  • Đổi loại từ{' '}
                  <span className="font-semibold text-zinc-200">
                    {data.old_record.type}
                  </span>{' '}
                  sang{' '}
                  <span className="font-semibold text-zinc-200">
                    {data.record.type}
                  </span>
                </p>
              )}

            {data?.record?.currency != null &&
              data?.old_record?.currency != null &&
              data?.record?.currency != data?.old_record?.currency && (
                <p>
                  • Đổi loại tiền tệ từ{' '}
                  <span className="font-semibold text-zinc-200">
                    {data.old_record.currency}
                  </span>{' '}
                  sang{' '}
                  <span className="font-semibold text-zinc-200">
                    {data.record.currency}
                  </span>
                </p>
              )}

            {data?.record?.balance != null &&
              data?.old_record?.balance != null &&
              data?.record?.balance != data?.old_record?.balance && (
                <p>
                  • Đổi số dư từ{' '}
                  <span className="font-semibold text-zinc-200">
                    {Intl.NumberFormat('vi-VN', {
                      style: 'currency',
                      currency: data?.old_record?.currency || 'USD',
                    }).format(data.old_record.balance)}
                  </span>{' '}
                  sang{' '}
                  <span className="font-semibold text-zinc-200">
                    {Intl.NumberFormat('vi-VN', {
                      style: 'currency',
                      currency: data?.record?.currency || 'USD',
                    }).format(data.record.balance)}
                  </span>
                </p>
              )}
          </>
        )}

        {data.op === 'DELETE' && data?.old_record?.name != null && (
          <>
            • Xóa{' '}
            <span className="font-semibold text-zinc-200">
              {data.old_record.name}
            </span>
          </>
        )}
      </div>
    );

  if (data.table_name === 'workspaces')
    return (
      <div className="flex flex-col rounded border border-zinc-300/10 bg-zinc-800 p-4">
        <p className="text-zinc-400">
          {data.op === 'INSERT' && data?.record?.name != null && (
            <>
              • Thiết lập tên thành{' '}
              <span className="font-semibold text-zinc-200">
                {data.record.name}
              </span>
            </>
          )}

          {data.op === 'UPDATE' &&
            data?.record?.name != null &&
            data?.old_record?.name != null && (
              <>
                • Đổi tên từ{' '}
                <span className="font-semibold text-zinc-200">
                  {data.old_record.name}
                </span>{' '}
                sang{' '}
                <span className="font-semibold text-zinc-200">
                  {data.record.name}
                </span>
              </>
            )}

          {data.op === 'DELETE' && data?.old_record?.name != null && (
            <>
              • Xóa
              <span className="font-semibold text-zinc-200">
                {data.old_record.name}
              </span>
            </>
          )}
        </p>
      </div>
    );

  if (isLoading)
    return (
      <div className="flex flex-col rounded border border-zinc-300/10 bg-zinc-800 p-4">
        <Loader className="self-center" color="gray" />
      </div>
    );

  if (userId)
    return (
      <div className="flex flex-col rounded border border-zinc-300/10 bg-zinc-800 p-4">
        <p className="text-zinc-400">
          {user != null && (
            <>
              •{' '}
              {data.op === 'INSERT'
                ? data.table_name === 'workspace_members'
                  ? 'Đã thêm'
                  : 'Đã mời'
                : data.table_name === 'workspace_members'
                ? 'Đã xóa'
                : 'Đã rút lại lời mời'}{' '}
              thành viên{' '}
              <span className="text-zinc-200">
                {user.display_name || 'Unknown'}
              </span>{' '}
              (
              <span className="font-semibold text-blue-300">
                {user?.handle ? `@${user.handle}` : 'không có tên người dùng'}
              </span>
              )
            </>
          )}
        </p>
      </div>
    );

  return (
    <JsonInput
      value={JSON.stringify(data, null, 2)}
      formatOnBlur
      autosize
      disabled
    />
  );
};

export default AuditSmartContent;
