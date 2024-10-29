import { Separator } from '@repo/ui/components/ui/separator';
import { useTranslations } from 'next-intl';

interface Props {
  title: string;
  description?: string;
  saving?: boolean;

  disabled?: boolean;
  comingSoon?: boolean;

  onSave?: () => void;
  onDelete?: () => void;

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
  onDelete,
  className,
  children,
}: Props) => {
  const t = useTranslations('common');

  const comingSoonLabel = t('coming_soon');
  const extraAction = onSave || onDelete || comingSoon;

  return (
    <div
      className={`border-border flex flex-col rounded border bg-zinc-50 p-4 text-zinc-700 dark:border-zinc-800/80 dark:bg-zinc-900 dark:text-zinc-300 ${
        disabled ? 'cursor-not-allowed opacity-50' : ''
      } ${className}`}
    >
      {title && <div className="mb-1 text-2xl font-bold">{title}</div>}
      {description && (
        <div className="text-foreground/80 mb-4 whitespace-pre-line font-semibold">
          {description}
        </div>
      )}

      {extraAction && <div className="h-full" />}

      {children}

      {extraAction && (
        <>
          <Separator className="my-4" />
          {comingSoon ? (
            <div className="flex cursor-not-allowed items-center justify-center rounded border border-zinc-300/10 bg-zinc-300/5 p-2 font-semibold text-zinc-300/30">
              {comingSoonLabel}
            </div>
          ) : (
            <div
              onClick={onSave || onDelete}
              className={`flex cursor-pointer items-center justify-center rounded border p-2 font-semibold transition duration-300 ${
                disabled
                  ? 'cursor-not-allowed opacity-50'
                  : onSave
                    ? 'border-blue-300/20 bg-blue-300/10 text-blue-300 hover:border-blue-300/30 hover:bg-blue-300/20'
                    : onDelete
                      ? 'border-red-300/20 bg-red-300/10 text-red-300 hover:border-red-300/30 hover:bg-red-300/20'
                      : ''
              }`}
            >
              {saving ? '...' : onSave ? t('save') : t('delete')}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default SettingItemCard;
