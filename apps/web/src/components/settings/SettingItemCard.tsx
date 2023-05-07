import { Divider } from '@mantine/core';
import useTranslation from 'next-translate/useTranslation';

interface Props {
  title: string;
  description: string;
  saving?: boolean;

  disabled?: boolean;
  comingSoon?: boolean;

  onSave?: () => void;

  className?: string;
  children?: React.ReactNode;
}

const SettingItemCard = ({
  title,
  description,
  saving,
  disabled,
  comingSoon,
  onSave,
  className,
  children,
}: Props) => {
  const { t } = useTranslation('common');

  const comingSoonLabel = t('coming-soon');

  return (
    <div
      className={`flex flex-col rounded border border-zinc-800/80 bg-zinc-900 p-4 ${
        disabled ? 'cursor-not-allowed opacity-50' : ''
      } ${className}`}
    >
      {title && <div className="mb-1 text-2xl font-bold">{title}</div>}
      {description && (
        <div className="mb-4 whitespace-pre-line font-semibold text-zinc-500">
          {description}
        </div>
      )}

      {(onSave || comingSoon) && <div className="h-full" />}

      {children}

      {(onSave || comingSoon) && (
        <>
          <Divider className="my-4" />
          {comingSoon ? (
            <div className="flex cursor-not-allowed items-center justify-center rounded border border-zinc-300/10 bg-zinc-300/5 p-2 font-semibold text-zinc-300/30">
              {comingSoonLabel}
            </div>
          ) : (
            <div
              onClick={onSave}
              className="flex cursor-pointer items-center justify-center rounded border border-blue-300/20 bg-blue-300/10 p-2 font-semibold text-blue-300 transition duration-300 hover:border-blue-300/30 hover:bg-blue-300/20"
            >
              {saving ? 'Saving...' : 'Save'}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default SettingItemCard;
