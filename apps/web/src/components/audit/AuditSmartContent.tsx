import { User } from '@tuturuuu/types/primitives/User';
import { AuditLog } from '@tuturuuu/types/primitives/audit-log';
import { useLocale, useTranslations } from 'next-intl';
import useSWR from 'swr';

interface Props {
  data: AuditLog;
  isExpanded: boolean;
}

const AuditSmartContent = ({ data, isExpanded }: Props) => {
  const locale = useLocale();
  const t = useTranslations('ws-activities');

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
    data.table_name === 'workspace_user_roles' ||
    data.table_name === 'workspace_user_groups'
  )
    return (
      <div className="border-border flex flex-col rounded border bg-zinc-500/5 p-4 dark:border-zinc-300/10 dark:bg-zinc-800">
        <div className="text-foreground/80">
          {data.op === 'INSERT' && data?.record?.name != null && (
            <div>
              • {t('set_name_to')}{' '}
              <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                {data.record.name}
              </span>
            </div>
          )}

          {data.op === 'UPDATE' &&
            ((data?.record?.name || '') != (data?.old_record?.name || '') ? (
              <div>
                • {t('rename_from')}{' '}
                <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                  {data.old_record.name}
                </span>{' '}
                {t('to')}{' '}
                <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                  {data.record.name}
                </span>
              </div>
            ) : (
              <div>
                • {t('name')}{' '}
                <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                  {data.record.name}
                </span>
              </div>
            ))}

          {data.op === 'DELETE' && data?.old_record?.name != null && (
            <div>
              • {t('removed')}{' '}
              <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                {data.old_record.name}
              </span>
            </div>
          )}
        </div>
      </div>
    );

  if (data.table_name === 'transaction_categories')
    return (
      <div className="border-border flex flex-col rounded border bg-zinc-500/5 p-4 dark:border-zinc-300/10 dark:bg-zinc-800">
        <div className="text-foreground/80">
          {data.op === 'INSERT' && data?.record?.name != null && (
            <div>
              • {t('set_name_to')}{' '}
              <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                {data.record.name}
              </span>
            </div>
          )}

          {data.op === 'INSERT' && data?.record?.is_expense != null && (
            <div>
              • {t('set_expense_type_to')}{' '}
              <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                {data.record.is_expense ? t('expense') : t('income')}
              </span>
            </div>
          )}

          {data.op === 'UPDATE' &&
            ((data?.record?.name || '') != (data?.old_record?.name || '') ? (
              <div>
                • {t('rename_from')}{' '}
                <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                  {data.old_record.name}
                </span>{' '}
                {t('to')}{' '}
                <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                  {data.record.name}
                </span>
              </div>
            ) : (
              <div>
                • {t('name')}{' '}
                <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                  {data.record.name}
                </span>
              </div>
            ))}

          {data.op === 'UPDATE' &&
            data?.record?.is_expense != data?.old_record?.is_expense && (
              <div>
                • {t('change_expense_type_from')}{' '}
                <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                  {data.old_record.is_expense ? 'Chi phí' : 'Thu nhập'}
                </span>{' '}
                {t('to')}{' '}
                <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                  {data.record.is_expense ? 'Chi phí' : 'Thu nhập'}
                </span>
              </div>
            )}

          {data.op === 'DELETE' && data?.old_record?.name != null && (
            <div>
              • {t('removed')}{' '}
              <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                {data.old_record.name}
              </span>
            </div>
          )}
        </div>
      </div>
    );

  if (data.table_name === 'healthcare_vitals')
    return (
      <div className="border-border flex flex-col rounded border bg-zinc-500/5 p-4 dark:border-zinc-300/10 dark:bg-zinc-800">
        <div className="text-foreground/80">
          {data.op === 'INSERT' && data?.record?.name != null && (
            <div>
              • {t('set_name_to')}{' '}
              <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                {data.record.name}
              </span>
            </div>
          )}

          {data.op === 'INSERT' && data?.record?.unit != null && (
            <div>
              • {t('set_unit_to')}{' '}
              <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                {data.record.unit}
              </span>
            </div>
          )}

          {data.op === 'UPDATE' &&
            ((data?.record?.name || '') != (data?.old_record?.name || '') ? (
              <div>
                • {t('rename_from')}{' '}
                <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                  {data.old_record.name}
                </span>{' '}
                {t('to')}{' '}
                <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                  {data.record.name}
                </span>
              </div>
            ) : (
              <div>
                • {t('name')}{' '}
                <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                  {data.record.name}
                </span>
              </div>
            ))}

          {data.op === 'UPDATE' &&
            data?.record?.unit != data?.old_record?.unit && (
              <div>
                • {t('change_unit_from')}{' '}
                <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                  {data.old_record.unit}
                </span>{' '}
                {t('to')}{' '}
                <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                  {data.record.unit}
                </span>
              </div>
            )}

          {data.op === 'DELETE' && data?.old_record?.name != null && (
            <div>
              • {t('removed')}{' '}
              <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                {data.old_record.name}
              </span>
            </div>
          )}
        </div>
      </div>
    );

  if (data.table_name === 'workspace_products')
    return (
      <div className="border-border flex flex-col rounded border bg-zinc-500/5 p-4 dark:border-zinc-300/10 dark:bg-zinc-800">
        <div className="text-foreground/80">
          {data.op === 'INSERT' && data?.record?.name && (
            <div>
              • {t('set_name_to')}{' '}
              <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                {data.record.name}
              </span>
            </div>
          )}

          {data.op === 'INSERT' && data?.record?.manufacturer && (
            <div>
              • {t('set_manufacturer_to')}{' '}
              <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                {data.record.manufacturer}
              </span>
            </div>
          )}

          {data.op === 'INSERT' && data?.record?.usage && (
            <div>
              • {t('set_usage_to')}{' '}
              <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                {data.record.usage}
              </span>
            </div>
          )}

          {data.op === 'INSERT' && data?.record?.description && (
            <div>
              • {t('set_description_to')}{' '}
              <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                {data.record.description}
              </span>
            </div>
          )}

          {data.op === 'UPDATE' &&
            ((data?.record?.name || '') != (data?.old_record?.name || '') ? (
              <div>
                • {t('rename_from')}{' '}
                <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                  {data.old_record.name}
                </span>{' '}
                {t('to')}{' '}
                <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                  {data.record.name}
                </span>
              </div>
            ) : (
              <div>
                • {t('name')}{' '}
                <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                  {data.record.name}
                </span>
              </div>
            ))}

          {data.op === 'UPDATE' &&
            (data?.record?.manufacturer || '') !=
              (data?.old_record?.manufacturer || '') && (
              <div>
                • {t('change_manufacturer_from')}{' '}
                <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                  {data.old_record.manufacturer}
                </span>{' '}
                {t('to')}{' '}
                <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                  {data.record.manufacturer}
                </span>
              </div>
            )}

          {data.op === 'UPDATE' &&
            (data?.record?.usage || '') != (data?.old_record?.usage || '') && (
              <div>
                • {t('change_usage_from')}{' '}
                <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                  {data.old_record.usage}
                </span>{' '}
                {t('to')}{' '}
                <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                  {data.record.usage}
                </span>
              </div>
            )}

          {data.op === 'UPDATE' &&
            (data?.record?.description || '') !=
              (data?.old_record?.description || '') && (
              <div>
                • {t('change_description_from')}{' '}
                <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                  {data.old_record.description}
                </span>{' '}
                {t('to')}{' '}
                <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                  {data.record.description}
                </span>
              </div>
            )}

          {data.op === 'DELETE' && data?.old_record?.name != null && (
            <div>
              • {t('removed')}{' '}
              <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                {data.old_record.name}
              </span>
            </div>
          )}
        </div>
      </div>
    );

  if (
    data.table_name === 'healthcare_diagnoses' ||
    data.table_name === 'healthcare_vital_groups'
  )
    return (
      <div className="border-border flex flex-col rounded border bg-zinc-500/5 p-4 dark:border-zinc-300/10 dark:bg-zinc-800">
        <div className="text-foreground/80">
          {data.op === 'INSERT' && data?.record?.name && (
            <div>
              • {t('set_name_to')}{' '}
              <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                {data.record.name}
              </span>
            </div>
          )}

          {data.op === 'INSERT' && data?.record?.note && (
            <div>
              • {t('set_note_to')}{' '}
              <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                {data.record.note}
              </span>
            </div>
          )}

          {data.op === 'INSERT' && data?.record?.description && (
            <div>
              • {t('set_description_to')}{' '}
              <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                {data.record.description}
              </span>
            </div>
          )}

          {data.op === 'UPDATE' &&
            ((data?.record?.name || '') != (data?.old_record?.name || '') ? (
              <div>
                • {t('rename_from')}{' '}
                <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                  {data.old_record.name}
                </span>{' '}
                {t('to')}{' '}
                <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                  {data.record.name}
                </span>
              </div>
            ) : (
              <div>
                • {t('name')}{' '}
                <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                  {data.record.name}
                </span>
              </div>
            ))}

          {data.op === 'UPDATE' &&
            (data?.record?.note || '') != (data?.old_record?.note || '') && (
              <div>
                • {t('change_note_from')}{' '}
                <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                  {data.old_record.note}
                </span>{' '}
                {t('to')}{' '}
                <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                  {data.record.note}
                </span>
              </div>
            )}

          {data.op === 'UPDATE' &&
            (data?.record?.description || '') !=
              (data?.old_record?.description || '') && (
              <div>
                • {t('change_description_from')}{' '}
                <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                  {data.old_record.description}
                </span>{' '}
                {t('to')}{' '}
                <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                  {data.record.description}
                </span>
              </div>
            )}

          {data.op === 'DELETE' && data?.old_record?.name != null && (
            <div>
              • {t('removed')}{' '}
              <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                {data.old_record.name}
              </span>
            </div>
          )}
        </div>
      </div>
    );

  if (data.table_name === 'workspace_users')
    return (
      <div className="border-border flex flex-col rounded border bg-zinc-500/5 p-4 dark:border-zinc-300/10 dark:bg-zinc-800">
        <div className="text-foreground/80">
          {data.op === 'INSERT' && data?.record?.name != null && (
            <div>
              • {t('set_name_to')}{' '}
              <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                {data.record.name}
              </span>
            </div>
          )}

          {data.op === 'INSERT' && data?.record?.note != null && (
            <div>
              • {t('set_note_to')}{' '}
              <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                {data.record.note}
              </span>
            </div>
          )}

          {data.op === 'INSERT' && data?.record?.email != null && (
            <div>
              • {t('set_email_to')}{' '}
              <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                {data.record.email}
              </span>
            </div>
          )}

          {data.op === 'INSERT' && data?.record?.phone != null && (
            <div>
              • {t('set_phone_to')}{' '}
              <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                {data.record.phone}
              </span>
            </div>
          )}

          {data.op === 'INSERT' && data?.record?.gender != null && (
            <div>
              • {t('set_gender_to')}{' '}
              <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                {data.record.gender}
              </span>
            </div>
          )}

          {data.op === 'INSERT' && data?.record?.address != null && (
            <div>
              • {t('set_address_to')}{' '}
              <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                {data.record.address}
              </span>
            </div>
          )}

          {data.op === 'INSERT' && data?.record?.balance != null && (
            <div>
              • {t('set_balance_to')}{' '}
              <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                {Intl.NumberFormat(locale, {
                  style: 'currency',
                  currency: 'VND',
                }).format(data.record.balance)}
              </span>
            </div>
          )}

          {data.op === 'INSERT' && data?.record?.birthday != null && (
            <div>
              • {t('set_birthday_to')}{' '}
              <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                {data.record.birthday}
              </span>
            </div>
          )}

          {data.op === 'INSERT' && data?.record?.guardian != null && (
            <div>
              • {t('set_guardian_to')}{' '}
              <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                {data.record.guardian}
              </span>
            </div>
          )}

          {data.op === 'INSERT' && data?.record?.ethnicity != null && (
            <div>
              • {t('set_ethnicity_to')}{' '}
              <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                {data.record.ethnicity}
              </span>
            </div>
          )}

          {data.op === 'INSERT' && data?.record?.national_id != null && (
            <div>
              • {t('set_national_id_to')}
              <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                {data.record.national_id}
              </span>
            </div>
          )}

          {data.op === 'UPDATE' &&
            ((data?.record?.name || '') != (data?.old_record?.name || '') ? (
              <div>
                • {t('rename_from')}{' '}
                <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                  {data.old_record.name}
                </span>{' '}
                {t('to')}{' '}
                <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                  {data.record.name}
                </span>
              </div>
            ) : (
              <div>
                • {t('name')}{' '}
                <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                  {data.record.name}
                </span>
              </div>
            ))}

          {data.op === 'UPDATE' &&
            (data?.record?.note || '') != (data?.old_record?.note || '') && (
              <div>
                • {t('change_note_from')}{' '}
                <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                  {data.old_record.note}
                </span>{' '}
                {t('to')}{' '}
                <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                  {data.record.note}
                </span>
              </div>
            )}

          {data.op === 'UPDATE' &&
            data?.record?.email != data?.old_record?.email && (
              <div>
                • {t('change_email_from')}{' '}
                <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                  {data.old_record.email}
                </span>{' '}
                {t('to')}{' '}
                <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                  {data.record.email}
                </span>
              </div>
            )}

          {data.op === 'UPDATE' &&
            data?.record?.phone != data?.old_record?.phone && (
              <div>
                • {t('change_phone_from')}{' '}
                <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                  {data.old_record.phone}
                </span>{' '}
                {t('to')}{' '}
                <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                  {data.record.phone}
                </span>
              </div>
            )}

          {data.op === 'UPDATE' &&
            data?.record?.gender != data?.old_record?.gender && (
              <div>
                • {t('change_gender_from')}{' '}
                <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                  {data.old_record.gender}
                </span>{' '}
                {t('to')}{' '}
                <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                  {data.record.gender}
                </span>
              </div>
            )}

          {data.op === 'UPDATE' &&
            data?.record?.address != data?.old_record?.address && (
              <div>
                • {t('change_address_from')}{' '}
                <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                  {data.old_record.address}
                </span>{' '}
                {t('to')}{' '}
                <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                  {data.record.address}
                </span>
              </div>
            )}

          {data.op === 'UPDATE' &&
            data?.record?.balance != data?.old_record?.balance && (
              <div>
                • {t('change_balance_from')}{' '}
                <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                  {Intl.NumberFormat(locale, {
                    style: 'currency',
                    currency: 'VND',
                  }).format(data.old_record.balance)}
                </span>{' '}
                {t('to')}{' '}
                <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                  {Intl.NumberFormat(locale, {
                    style: 'currency',
                    currency: 'VND',
                  }).format(data.record.balance)}
                </span>
              </div>
            )}

          {data.op === 'UPDATE' &&
            data?.record?.birthday != data?.old_record?.birthday && (
              <div>
                • {t('change_birthday_from')}{' '}
                <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                  {data.old_record.birthday}
                </span>{' '}
                {t('to')}{' '}
                <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                  {data.record.birthday}
                </span>
              </div>
            )}

          {data.op === 'UPDATE' &&
            data?.record?.guardian != data?.old_record?.guardian && (
              <div>
                • {t('change_guardian_from')}{' '}
                <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                  {data.old_record.guardian}
                </span>{' '}
                {t('to')}{' '}
                <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                  {data.record.guardian}
                </span>
              </div>
            )}

          {data.op === 'UPDATE' &&
            data?.record?.ethnicity != data?.old_record?.ethnicity && (
              <div>
                • {t('change_ethnicity_from')}{' '}
                <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                  {data.old_record.ethnicity}
                </span>{' '}
                {t('to')}{' '}
                <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                  {data.record.ethnicity}
                </span>
              </div>
            )}

          {data.op === 'UPDATE' &&
            data?.record?.national_id != data?.old_record?.national_id && (
              <div>
                • {t('change_national_id_from')}{' '}
                <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                  {data.old_record.national_id}
                </span>{' '}
                {t('to')}{' '}
                <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                  {data.record.email}
                </span>
              </div>
            )}

          {data.op === 'DELETE' && data?.old_record?.name != null && (
            <div>
              • {t('removed')}{' '}
              <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                {data.old_record.name}
              </span>
            </div>
          )}
        </div>
      </div>
    );

  if (data.table_name === 'workspace_wallets')
    return (
      <div className="border-border flex flex-col rounded border bg-zinc-500/5 p-4 dark:border-zinc-300/10 dark:bg-zinc-800">
        {data.op === 'INSERT' && (
          <>
            {data?.record?.name != null && (
              <div>
                • {t('set_wallet_name_to')}{' '}
                <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                  {data.record.name}
                </span>
              </div>
            )}

            {data?.record?.type != null && (
              <div>
                • {t('set_wallet_type_to')}{' '}
                <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                  {data.record.type}
                </span>
              </div>
            )}

            {data?.record?.currency != null && (
              <div>
                • {t('set_wallet_currency_to')}{' '}
                <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                  {data.record.currency}
                </span>
              </div>
            )}

            {data?.record?.balance != null && (
              <div>
                • {t('set_wallet_balance_to')}{' '}
                <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                  {Intl.NumberFormat(locale, {
                    style: 'currency',
                    currency: data?.record?.currency || 'USD',
                  }).format(data.record.balance)}
                </span>
              </div>
            )}
          </>
        )}

        {data.op === 'UPDATE' && (
          <>
            {(data?.record?.name || '') != (data?.old_record?.name || '') ? (
              <div>
                • {t('rename_from')}{' '}
                <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                  {data.old_record.name}
                </span>{' '}
                {t('to')}{' '}
                <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                  {data.record.name}
                </span>
              </div>
            ) : (
              <div>
                • {t('name')}{' '}
                <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                  {data.record.name}
                </span>
              </div>
            )}

            {data?.record?.type != data?.old_record?.type && (
              <div>
                • {t('change_type_from')}{' '}
                <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                  {data.old_record.type}
                </span>{' '}
                {t('to')}{' '}
                <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                  {data.record.type}
                </span>
              </div>
            )}

            {data?.record?.currency != data?.old_record?.currency && (
              <div>
                • {t('change_currency_from')}{' '}
                <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                  {data.old_record.currency}
                </span>{' '}
                {t('to')}{' '}
                <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                  {data.record.currency}
                </span>
              </div>
            )}

            {data?.record?.balance != data?.old_record?.balance && (
              <div>
                • {t('change_balance_from')}{' '}
                <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                  {Intl.NumberFormat(locale, {
                    style: 'currency',
                    currency: data?.old_record?.currency || 'USD',
                  }).format(data.old_record.balance)}
                </span>{' '}
                {t('to')}{' '}
                <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                  {Intl.NumberFormat(locale, {
                    style: 'currency',
                    currency: data?.record?.currency || 'USD',
                  }).format(data.record.balance)}
                </span>
              </div>
            )}

            {JSON.stringify(data?.record) ===
            JSON.stringify(data?.old_record) ? (
              <div>• {t('no_changes')}</div>
            ) : null}
          </>
        )}

        {data.op === 'DELETE' && data?.old_record?.name != null && (
          <div>
            • {t('removed')}{' '}
            <span className="font-semibold text-zinc-700 dark:text-zinc-200">
              {data.old_record.name}
            </span>
          </div>
        )}
      </div>
    );

  if (data.table_name === 'workspaces')
    return (
      <div className="border-border flex flex-col rounded border bg-zinc-500/5 p-4 dark:border-zinc-300/10 dark:bg-zinc-800">
        <div className="text-foreground/80">
          {data.op === 'INSERT' && data?.record?.name != null && (
            <div>
              • {t('set_name_to')}{' '}
              <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                {data.record.name}
              </span>
            </div>
          )}

          {data.op === 'UPDATE' &&
            (data?.record?.name || '') != (data?.old_record?.name || '') && (
              <div>
                • {t('rename_from')}{' '}
                <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                  {data.old_record.name}
                </span>{' '}
                {t('to')}{' '}
                <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                  {data.record.name}
                </span>
              </div>
            )}

          {data.op === 'DELETE' && data?.old_record?.name != null && (
            <div>
              • {t('removed')}{' '}
              <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                {data.old_record.name}
              </span>
            </div>
          )}
        </div>
      </div>
    );

  if (isLoading)
    return (
      <div className="border-border flex flex-col rounded border bg-zinc-500/5 p-4 dark:border-zinc-300/10 dark:bg-zinc-800">
        {/* <Loader className="self-center" color="gray" /> */}
      </div>
    );

  if (userId)
    return (
      <div className="border-border flex flex-col rounded border bg-zinc-500/5 p-4 dark:border-zinc-300/10 dark:bg-zinc-800">
        <div className="text-foreground/80">
          {user != null && (
            <>
              {data.op === 'INSERT' && (
                <div>
                  •{' '}
                  {data.table_name === 'workspace_members'
                    ? t('added')
                    : t('invited')}{' '}
                  {t('member')}{' '}
                  <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                    {user.display_name || t('no_display_name')}
                  </span>{' '}
                  (
                  <span className="font-semibold text-blue-600 dark:text-blue-300">
                    {user?.handle ? `@${user.handle}` : t('no_handle')}
                  </span>
                  )
                </div>
              )}

              {data.op === 'UPDATE' && (
                <>
                  {data?.record?.role != data?.old_record?.role && (
                    <div>
                      • {t('change_role_from')}{' '}
                      <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                        {t(
                          ('ws-members.' +
                            data.old_record.role.toLowerCase()) as any
                        )}
                      </span>{' '}
                      {t('to')}{' '}
                      <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                        {t(
                          ('ws-members.' +
                            data.record.role.toLowerCase()) as any
                        )}
                      </span>
                    </div>
                  )}

                  {data?.record?.role_title != data?.old_record?.role_title &&
                    data?.record?.role_title != null && (
                      <div>
                        • {t('change_role_title_from')}{' '}
                        <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                          {data.old_record.role_title}
                        </span>{' '}
                        {t('to')}{' '}
                        <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                          {data.record.role_title}
                        </span>
                      </div>
                    )}
                </>
              )}

              {data.op === 'DELETE' && (
                <div>
                  •{' '}
                  {data.table_name === 'workspace_members'
                    ? t('removed')
                    : t('revoked_invite')}{' '}
                  {t('member')}{' '}
                  <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                    {user.display_name || t('no_display_name')}
                  </span>{' '}
                  (
                  <span className="font-semibold text-blue-600 dark:text-blue-300">
                    {user?.handle ? `@${user.handle}` : t('no_handle')}
                  </span>
                  )
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );

  return <div>{JSON.stringify(data, null, 2)}</div>;

  // return (
  //   <JsonInput
  //     value={JSON.stringify(data, null, 2)}
  //     formatOnBlur
  //     autosize
  //     disabled
  //   />
  // );
};

export default AuditSmartContent;
