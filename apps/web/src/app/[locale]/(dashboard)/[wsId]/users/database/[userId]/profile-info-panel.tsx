import moment from 'moment';
import { DetailCard, EmptyPanel } from './detail-card';
import type { UserDetail } from './types';

type ProfileField = {
  label: string;
  value?: string | null;
  wide?: boolean;
};

export function ProfileInfoPanel({
  user,
  hasPrivateInfo,
  hasPublicInfo,
  labels,
}: {
  user: UserDetail;
  hasPrivateInfo: boolean;
  hasPublicInfo: boolean;
  labels: {
    address: string;
    basicInformation: string;
    birthday: string;
    createdAt: string;
    displayName: string;
    email: string;
    empty: string;
    ethnicity: string;
    fullName: string;
    gender: string;
    guardian: string;
    nationalId: string;
    note: string;
    phone: string;
    updatedAt: string;
  };
}) {
  const candidateFields: (ProfileField | undefined)[] = [
    hasPublicInfo
      ? { label: labels.fullName, value: user.full_name }
      : undefined,
    hasPublicInfo
      ? { label: labels.displayName, value: user.display_name }
      : undefined,
    hasPrivateInfo ? { label: labels.email, value: user.email } : undefined,
    hasPrivateInfo ? { label: labels.phone, value: user.phone } : undefined,
    hasPrivateInfo
      ? { label: labels.birthday, value: user.birthday }
      : undefined,
    hasPrivateInfo ? { label: labels.gender, value: user.gender } : undefined,
    hasPrivateInfo
      ? { label: labels.ethnicity, value: user.ethnicity }
      : undefined,
    hasPrivateInfo
      ? { label: labels.guardian, value: user.guardian }
      : undefined,
    hasPrivateInfo
      ? { label: labels.nationalId, value: user.national_id }
      : undefined,
    hasPrivateInfo
      ? { label: labels.address, value: user.address, wide: true }
      : undefined,
    hasPrivateInfo
      ? { label: labels.note, value: user.note, wide: true }
      : undefined,
    hasPublicInfo
      ? {
          label: labels.createdAt,
          value: formatDateTime(user.created_at),
        }
      : undefined,
    hasPublicInfo
      ? {
          label: labels.updatedAt,
          value: formatDateTime(user.updated_at),
        }
      : undefined,
  ];
  const fields = candidateFields.filter((field): field is ProfileField =>
    Boolean(field?.value)
  );

  return (
    <DetailCard title={labels.basicInformation}>
      {fields.length > 0 ? (
        <dl className="grid gap-2 md:grid-cols-2">
          {fields.map((field) => (
            <div
              key={field.label}
              className={
                field.wide
                  ? 'rounded-lg border border-dynamic-border bg-muted/20 p-3 md:col-span-2'
                  : 'rounded-lg border border-dynamic-border bg-muted/20 p-3'
              }
            >
              <dt className="text-muted-foreground text-xs">{field.label}</dt>
              <dd className="mt-1 break-words font-medium text-sm">
                {field.value}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <EmptyPanel>{labels.empty}</EmptyPanel>
      )}
    </DetailCard>
  );
}

function formatDateTime(value?: string | null) {
  return value ? moment(value).format('DD/MM/YYYY, HH:mm:ss') : null;
}
