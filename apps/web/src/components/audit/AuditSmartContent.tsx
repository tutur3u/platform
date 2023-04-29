import { JsonInput, Loader } from '@mantine/core';
import { AuditLog } from '../../types/primitives/AuditLog';
import { User } from '../../types/primitives/User';
import useSWR from 'swr';
import useTranslation from 'next-translate/useTranslation';

interface Props {
  data: AuditLog;
  isExpanded: boolean;
}

const AuditSmartContent = ({ data, isExpanded }: Props) => {
  const { t, lang } = useTranslation('ws-activities');

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
            <p>
              • {t('set_name_to')}{' '}
              <span className="font-semibold text-zinc-200">
                {data.record.name}
              </span>
            </p>
          )}

          {data.op === 'UPDATE' &&
            (data?.record?.name != data?.old_record?.name ? (
              <p>
                • {t('rename_from')}{' '}
                <span className="font-semibold text-zinc-200">
                  {data.old_record.name}
                </span>{' '}
                {t('to')}{' '}
                <span className="font-semibold text-zinc-200">
                  {data.record.name}
                </span>
              </p>
            ) : (
              <p>
                • {t('name')}{' '}
                <span className="font-semibold text-zinc-200">
                  {data.record.name}
                </span>
              </p>
            ))}

          {data.op === 'DELETE' && data?.old_record?.name != null && (
            <p>
              • {t('removed')}{' '}
              <span className="font-semibold text-zinc-200">
                {data.old_record.name}
              </span>
            </p>
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
              • {t('set_name_to')}{' '}
              <span className="font-semibold text-zinc-200">
                {data.record.name}
              </span>
            </p>
          )}

          {data.op === 'INSERT' && data?.record?.is_expense != null && (
            <p>
              • {t('set_expense_type_to')}{' '}
              <span className="font-semibold text-zinc-200">
                {data.record.is_expense ? t('expense') : t('income')}
              </span>
            </p>
          )}

          {data.op === 'UPDATE' &&
            (data?.record?.name != data?.old_record?.name ? (
              <p>
                • {t('rename_from')}{' '}
                <span className="font-semibold text-zinc-200">
                  {data.old_record.name}
                </span>{' '}
                {t('to')}{' '}
                <span className="font-semibold text-zinc-200">
                  {data.record.name}
                </span>
              </p>
            ) : (
              <p>
                • {t('name')}{' '}
                <span className="font-semibold text-zinc-200">
                  {data.record.name}
                </span>
              </p>
            ))}

          {data.op === 'UPDATE' &&
            data?.record?.is_expense != data?.old_record?.is_expense && (
              <p>
                • {t('change_expense_type_from')}{' '}
                <span className="font-semibold text-zinc-200">
                  {data.old_record.is_expense ? 'Chi phí' : 'Thu nhập'}
                </span>{' '}
                {t('to')}{' '}
                <span className="font-semibold text-zinc-200">
                  {data.record.is_expense ? 'Chi phí' : 'Thu nhập'}
                </span>
              </p>
            )}

          {data.op === 'DELETE' && data?.old_record?.name != null && (
            <p>
              • {t('removed')}{' '}
              <span className="font-semibold text-zinc-200">
                {data.old_record.name}
              </span>
            </p>
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
              • {t('set_name_to')}{' '}
              <span className="font-semibold text-zinc-200">
                {data.record.name}
              </span>
            </p>
          )}

          {data.op === 'INSERT' && data?.record?.unit != null && (
            <p>
              • {t('set_unit_to')}{' '}
              <span className="font-semibold text-zinc-200">
                {data.record.unit}
              </span>
            </p>
          )}

          {data.op === 'UPDATE' &&
            (data?.record?.name != data?.old_record?.name ? (
              <p>
                • {t('rename_from')}{' '}
                <span className="font-semibold text-zinc-200">
                  {data.old_record.name}
                </span>{' '}
                {t('to')}{' '}
                <span className="font-semibold text-zinc-200">
                  {data.record.name}
                </span>
              </p>
            ) : (
              <p>
                • {t('name')}{' '}
                <span className="font-semibold text-zinc-200">
                  {data.record.name}
                </span>
              </p>
            ))}

          {data.op === 'UPDATE' &&
            data?.record?.unit != data?.old_record?.unit && (
              <p>
                • {t('change_unit_from')}{' '}
                <span className="font-semibold text-zinc-200">
                  {data.old_record.unit}
                </span>{' '}
                {t('to')}{' '}
                <span className="font-semibold text-zinc-200">
                  {data.record.unit}
                </span>
              </p>
            )}

          {data.op === 'DELETE' && data?.old_record?.name != null && (
            <p>
              • {t('removed')}{' '}
              <span className="font-semibold text-zinc-200">
                {data.old_record.name}
              </span>
            </p>
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
              • {t('set_name_to')}{' '}
              <span className="font-semibold text-zinc-200">
                {data.record.name}
              </span>
            </p>
          )}

          {data.op === 'INSERT' && data?.record?.manufacturer != null && (
            <p>
              • {t('set_manufacturer_to')}{' '}
              <span className="font-semibold text-zinc-200">
                {data.record.manufacturer}
              </span>
            </p>
          )}

          {data.op === 'INSERT' && data?.record?.usage != null && (
            <p>
              • {t('set_usage_to')}{' '}
              <span className="font-semibold text-zinc-200">
                {data.record.usage}
              </span>
            </p>
          )}

          {data.op === 'INSERT' && data?.record?.description != null && (
            <p>
              • {t('set_description_to')}{' '}
              <span className="font-semibold text-zinc-200">
                {data.record.description}
              </span>
            </p>
          )}

          {data.op === 'UPDATE' &&
            (data?.record?.name != data?.old_record?.name ? (
              <p>
                • {t('rename_from')}{' '}
                <span className="font-semibold text-zinc-200">
                  {data.old_record.name}
                </span>{' '}
                {t('to')}{' '}
                <span className="font-semibold text-zinc-200">
                  {data.record.name}
                </span>
              </p>
            ) : (
              <p>
                • {t('name')}{' '}
                <span className="font-semibold text-zinc-200">
                  {data.record.name}
                </span>
              </p>
            ))}

          {data.op === 'UPDATE' &&
            data?.record?.manufacturer != data?.old_record?.manufacturer && (
              <p>
                • {t('change_manufacturer_from')}{' '}
                <span className="font-semibold text-zinc-200">
                  {data.old_record.manufacturer}
                </span>{' '}
                {t('to')}{' '}
                <span className="font-semibold text-zinc-200">
                  {data.record.manufacturer}
                </span>
              </p>
            )}

          {data.op === 'UPDATE' &&
            data?.record?.usage != data?.old_record?.usage && (
              <p>
                • {t('change_usage_from')}{' '}
                <span className="font-semibold text-zinc-200">
                  {data.old_record.usage}
                </span>{' '}
                {t('to')}{' '}
                <span className="font-semibold text-zinc-200">
                  {data.record.usage}
                </span>
              </p>
            )}

          {data.op === 'UPDATE' &&
            (data?.record?.description || '') !=
              (data?.old_record?.description || '') && (
              <p>
                • {t('change_description_from')}{' '}
                <span className="font-semibold text-zinc-200">
                  {data.old_record.description}
                </span>{' '}
                {t('to')}{' '}
                <span className="font-semibold text-zinc-200">
                  {data.record.description}
                </span>
              </p>
            )}

          {data.op === 'DELETE' && data?.old_record?.name != null && (
            <p>
              • {t('removed')}{' '}
              <span className="font-semibold text-zinc-200">
                {data.old_record.name}
              </span>
            </p>
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
              • {t('set_name_to')}{' '}
              <span className="font-semibold text-zinc-200">
                {data.record.name}
              </span>
            </p>
          )}

          {data.op === 'INSERT' && data?.record?.note != null && (
            <p>
              • {t('set_note_to')}{' '}
              <span className="font-semibold text-zinc-200">
                {data.record.note}
              </span>
            </p>
          )}

          {data.op === 'INSERT' && data?.record?.description != null && (
            <p>
              • {t('set_description_to')}{' '}
              <span className="font-semibold text-zinc-200">
                {data.record.description}
              </span>
            </p>
          )}

          {data.op === 'UPDATE' &&
            (data?.record?.name != data?.old_record?.name ? (
              <p>
                • {t('rename_from')}{' '}
                <span className="font-semibold text-zinc-200">
                  {data.old_record.name}
                </span>{' '}
                {t('to')}{' '}
                <span className="font-semibold text-zinc-200">
                  {data.record.name}
                </span>
              </p>
            ) : (
              <p>
                • {t('name')}{' '}
                <span className="font-semibold text-zinc-200">
                  {data.record.name}
                </span>
              </p>
            ))}

          {data.op === 'UPDATE' &&
            (data?.record?.note || '') != (data?.old_record?.note || '') && (
              <p>
                • {t('change_note_from')}{' '}
                <span className="font-semibold text-zinc-200">
                  {data.old_record.note}
                </span>{' '}
                {t('to')}{' '}
                <span className="font-semibold text-zinc-200">
                  {data.record.note}
                </span>
              </p>
            )}

          {data.op === 'UPDATE' &&
            (data?.record?.description || '') !=
              (data?.old_record?.description || '') && (
              <p>
                • {t('change_description_from')}{' '}
                <span className="font-semibold text-zinc-200">
                  {data.old_record.description}
                </span>{' '}
                {t('to')}{' '}
                <span className="font-semibold text-zinc-200">
                  {data.record.description}
                </span>
              </p>
            )}

          {data.op === 'DELETE' && data?.old_record?.name != null && (
            <p>
              • {t('removed')}{' '}
              <span className="font-semibold text-zinc-200">
                {data.old_record.name}
              </span>
            </p>
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
              • {t('set_name_to')}{' '}
              <span className="font-semibold text-zinc-200">
                {data.record.name}
              </span>
            </p>
          )}

          {data.op === 'INSERT' && data?.record?.note != null && (
            <p>
              • {t('set_note_to')}{' '}
              <span className="font-semibold text-zinc-200">
                {data.record.note}
              </span>
            </p>
          )}

          {data.op === 'INSERT' && data?.record?.email != null && (
            <p>
              • {t('set_email_to')}{' '}
              <span className="font-semibold text-zinc-200">
                {data.record.email}
              </span>
            </p>
          )}

          {data.op === 'INSERT' && data?.record?.phone != null && (
            <p>
              • {t('set_phone_to')}{' '}
              <span className="font-semibold text-zinc-200">
                {data.record.phone}
              </span>
            </p>
          )}

          {data.op === 'INSERT' && data?.record?.gender != null && (
            <p>
              • {t('set_gender_to')}{' '}
              <span className="font-semibold text-zinc-200">
                {data.record.gender}
              </span>
            </p>
          )}

          {data.op === 'INSERT' && data?.record?.address != null && (
            <p>
              • {t('set_address_to')}{' '}
              <span className="font-semibold text-zinc-200">
                {data.record.address}
              </span>
            </p>
          )}

          {data.op === 'INSERT' && data?.record?.balance != null && (
            <p>
              • {t('set_balance_to')}{' '}
              <span className="font-semibold text-zinc-200">
                {Intl.NumberFormat(lang, {
                  style: 'currency',
                  currency: 'VND',
                }).format(data.record.balance)}
              </span>
            </p>
          )}

          {data.op === 'INSERT' && data?.record?.birthday != null && (
            <p>
              • {t('set_birthday_to')}{' '}
              <span className="font-semibold text-zinc-200">
                {data.record.birthday}
              </span>
            </p>
          )}

          {data.op === 'INSERT' && data?.record?.guardian != null && (
            <p>
              • {t('set_guardian_to')}{' '}
              <span className="font-semibold text-zinc-200">
                {data.record.guardian}
              </span>
            </p>
          )}

          {data.op === 'INSERT' && data?.record?.ethnicity != null && (
            <p>
              • {t('set_ethnicity_to')}{' '}
              <span className="font-semibold text-zinc-200">
                {data.record.ethnicity}
              </span>
            </p>
          )}

          {data.op === 'INSERT' && data?.record?.national_id != null && (
            <p>
              • {t('set_national_id_to')}
              <span className="font-semibold text-zinc-200">
                {data.record.national_id}
              </span>
            </p>
          )}

          {data.op === 'UPDATE' &&
            (data?.record?.name != data?.old_record?.name ? (
              <p>
                • {t('rename_from')}{' '}
                <span className="font-semibold text-zinc-200">
                  {data.old_record.name}
                </span>{' '}
                {t('to')}{' '}
                <span className="font-semibold text-zinc-200">
                  {data.record.name}
                </span>
              </p>
            ) : (
              <p>
                • {t('name')}{' '}
                <span className="font-semibold text-zinc-200">
                  {data.record.name}
                </span>
              </p>
            ))}

          {data.op === 'UPDATE' &&
            (data?.record?.note || '') != (data?.old_record?.note || '') && (
              <p>
                • {t('change_note_from')}{' '}
                <span className="font-semibold text-zinc-200">
                  {data.old_record.note}
                </span>{' '}
                {t('to')}{' '}
                <span className="font-semibold text-zinc-200">
                  {data.record.note}
                </span>
              </p>
            )}

          {data.op === 'UPDATE' &&
            data?.record?.email != data?.old_record?.email && (
              <p>
                • {t('change_email_from')}{' '}
                <span className="font-semibold text-zinc-200">
                  {data.old_record.email}
                </span>{' '}
                {t('to')}{' '}
                <span className="font-semibold text-zinc-200">
                  {data.record.email}
                </span>
              </p>
            )}

          {data.op === 'UPDATE' &&
            data?.record?.phone != data?.old_record?.phone && (
              <p>
                • {t('change_phone_from')}{' '}
                <span className="font-semibold text-zinc-200">
                  {data.old_record.phone}
                </span>{' '}
                {t('to')}{' '}
                <span className="font-semibold text-zinc-200">
                  {data.record.phone}
                </span>
              </p>
            )}

          {data.op === 'UPDATE' &&
            data?.record?.gender != data?.old_record?.gender && (
              <p>
                • {t('change_gender_from')}{' '}
                <span className="font-semibold text-zinc-200">
                  {data.old_record.gender}
                </span>{' '}
                {t('to')}{' '}
                <span className="font-semibold text-zinc-200">
                  {data.record.gender}
                </span>
              </p>
            )}

          {data.op === 'UPDATE' &&
            data?.record?.address != data?.old_record?.address && (
              <p>
                • {t('change_address_from')}{' '}
                <span className="font-semibold text-zinc-200">
                  {data.old_record.address}
                </span>{' '}
                {t('to')}{' '}
                <span className="font-semibold text-zinc-200">
                  {data.record.address}
                </span>
              </p>
            )}

          {data.op === 'UPDATE' &&
            data?.record?.balance != data?.old_record?.balance && (
              <p>
                • {t('change_balance_from')}{' '}
                <span className="font-semibold text-zinc-200">
                  {Intl.NumberFormat(lang, {
                    style: 'currency',
                    currency: 'VND',
                  }).format(data.old_record.balance)}
                </span>{' '}
                {t('to')}{' '}
                <span className="font-semibold text-zinc-200">
                  {Intl.NumberFormat(lang, {
                    style: 'currency',
                    currency: 'VND',
                  }).format(data.record.balance)}
                </span>
              </p>
            )}

          {data.op === 'UPDATE' &&
            data?.record?.birthday != data?.old_record?.birthday && (
              <p>
                • {t('change_birthday_from')}{' '}
                <span className="font-semibold text-zinc-200">
                  {data.old_record.birthday}
                </span>{' '}
                {t('to')}{' '}
                <span className="font-semibold text-zinc-200">
                  {data.record.birthday}
                </span>
              </p>
            )}

          {data.op === 'UPDATE' &&
            data?.record?.guardian != data?.old_record?.guardian && (
              <p>
                • {t('change_guardian_from')}{' '}
                <span className="font-semibold text-zinc-200">
                  {data.old_record.guardian}
                </span>{' '}
                {t('to')}{' '}
                <span className="font-semibold text-zinc-200">
                  {data.record.guardian}
                </span>
              </p>
            )}

          {data.op === 'UPDATE' &&
            data?.record?.ethnicity != data?.old_record?.ethnicity && (
              <p>
                • {t('change_ethnicity_from')}{' '}
                <span className="font-semibold text-zinc-200">
                  {data.old_record.ethnicity}
                </span>{' '}
                {t('to')}{' '}
                <span className="font-semibold text-zinc-200">
                  {data.record.ethnicity}
                </span>
              </p>
            )}

          {data.op === 'UPDATE' &&
            data?.record?.national_id != data?.old_record?.national_id && (
              <p>
                • {t('change_national_id_from')}{' '}
                <span className="font-semibold text-zinc-200">
                  {data.old_record.national_id}
                </span>{' '}
                {t('to')}{' '}
                <span className="font-semibold text-zinc-200">
                  {data.record.email}
                </span>
              </p>
            )}

          {data.op === 'DELETE' && data?.old_record?.name != null && (
            <p>
              • {t('removed')}{' '}
              <span className="font-semibold text-zinc-200">
                {data.old_record.name}
              </span>
            </p>
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
                • {t('set_wallet_name_to')}{' '}
                <span className="font-semibold text-zinc-200">
                  {data.record.name}
                </span>
              </p>
            )}

            {data?.record?.type != null && (
              <p>
                • {t('set_wallet_type_to')}{' '}
                <span className="font-semibold text-zinc-200">
                  {data.record.type}
                </span>
              </p>
            )}

            {data?.record?.currency != null && (
              <p>
                • {t('set_wallet_currency_to')}{' '}
                <span className="font-semibold text-zinc-200">
                  {data.record.currency}
                </span>
              </p>
            )}

            {data?.record?.balance != null && (
              <p>
                • {t('set_wallet_balance_to')}{' '}
                <span className="font-semibold text-zinc-200">
                  {Intl.NumberFormat(lang, {
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
              <p>• {t('no_changes')}</p>
            ) : null}

            {data?.record?.name != data?.old_record?.name ? (
              <p>
                • {t('rename_from')}{' '}
                <span className="font-semibold text-zinc-200">
                  {data.old_record.name}
                </span>{' '}
                {t('to')}{' '}
                <span className="font-semibold text-zinc-200">
                  {data.record.name}
                </span>
              </p>
            ) : (
              <p>
                • {t('name')}{' '}
                <span className="font-semibold text-zinc-200">
                  {data.record.name}
                </span>
              </p>
            )}

            {data?.record?.type != data?.old_record?.type && (
              <p>
                • {t('change_type_from')}{' '}
                <span className="font-semibold text-zinc-200">
                  {data.old_record.type}
                </span>{' '}
                {t('to')}{' '}
                <span className="font-semibold text-zinc-200">
                  {data.record.type}
                </span>
              </p>
            )}

            {data?.record?.currency != data?.old_record?.currency && (
              <p>
                • {t('change_currency_from')}{' '}
                <span className="font-semibold text-zinc-200">
                  {data.old_record.currency}
                </span>{' '}
                {t('to')}{' '}
                <span className="font-semibold text-zinc-200">
                  {data.record.currency}
                </span>
              </p>
            )}

            {data?.record?.balance != data?.old_record?.balance && (
              <p>
                • {t('change_balance_from')}{' '}
                <span className="font-semibold text-zinc-200">
                  {Intl.NumberFormat(lang, {
                    style: 'currency',
                    currency: data?.old_record?.currency || 'USD',
                  }).format(data.old_record.balance)}
                </span>{' '}
                {t('to')}{' '}
                <span className="font-semibold text-zinc-200">
                  {Intl.NumberFormat(lang, {
                    style: 'currency',
                    currency: data?.record?.currency || 'USD',
                  }).format(data.record.balance)}
                </span>
              </p>
            )}
          </>
        )}

        {data.op === 'DELETE' && data?.old_record?.name != null && (
          <p>
            • {t('removed')}{' '}
            <span className="font-semibold text-zinc-200">
              {data.old_record.name}
            </span>
          </p>
        )}
      </div>
    );

  if (data.table_name === 'workspaces')
    return (
      <div className="flex flex-col rounded border border-zinc-300/10 bg-zinc-800 p-4">
        <p className="text-zinc-400">
          {data.op === 'INSERT' && data?.record?.name != null && (
            <p>
              • {t('set_name_to')}{' '}
              <span className="font-semibold text-zinc-200">
                {data.record.name}
              </span>
            </p>
          )}

          {data.op === 'UPDATE' &&
            data?.record?.name != data?.old_record?.name && (
              <p>
                • {t('rename_from')}{' '}
                <span className="font-semibold text-zinc-200">
                  {data.old_record.name}
                </span>{' '}
                {t('to')}{' '}
                <span className="font-semibold text-zinc-200">
                  {data.record.name}
                </span>
              </p>
            )}

          {data.op === 'DELETE' && data?.old_record?.name != null && (
            <p>
              • {t('removed')}{' '}
              <span className="font-semibold text-zinc-200">
                {data.old_record.name}
              </span>
            </p>
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
            <p>
              •{' '}
              {data.op === 'INSERT'
                ? data.table_name === 'workspace_members'
                  ? t('added')
                  : t('invited')
                : data.table_name === 'workspace_members'
                ? t('removed')
                : t('revoked_invite')}{' '}
              {t('member')}{' '}
              <span className="font-semibold text-zinc-200">
                {user.display_name || t('no_display_name')}
              </span>{' '}
              (
              <span className="font-semibold text-blue-300">
                {user?.handle ? `@${user.handle}` : t('no_handle')}
              </span>
              )
            </p>
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
