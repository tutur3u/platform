import useTranslation from 'next-translate/useTranslation';
import Link from 'next/link';

interface Props {
  title: string;
  value?: string | number | null;
  href?: string;
  loading?: boolean;
  className?: string;
  onClick?: () => void;
}

const StatisticCard = ({
  title,
  value,
  href,
  loading,
  className,
  onClick,
}: Props) => {
  const { t } = useTranslation();
  const loadingLabel = t('common:loading');

  const generateOuterColor = (enableHoverEffect: boolean) =>
    `border-foreground/20 ${
      enableHoverEffect
        ? 'hover:bg-foreground/[0.025] dark:hover:bg-foreground/5'
        : 'border-foreground/[0.1]'
    }`;

  if (href)
    return (
      <Link
        href={href}
        onClick={onClick}
        className={`group rounded-lg border transition-all duration-300 ${
          onClick || href ? 'hover:rounded-xl' : 'cursor-default'
        } ${generateOuterColor(!!onClick || !!href)} ${className || ''}`}
      >
        <div
          className={`p-1 text-center text-lg font-semibold ${
            loading ? 'text-transparent' : ''
          }`}
        >
          {title}
        </div>
        <div
          className={`border-foreground/5 bg-foreground/5 m-2 mt-0 flex items-center justify-center rounded border p-4 text-2xl font-bold ${
            !!onClick || !!href
              ? 'transition-all duration-300 group-hover:rounded-lg'
              : ''
          } ${loading ? 'animate-pulse text-transparent' : 'text-foreground'}`}
        >
          {loading ? loadingLabel : value != null ? value : 'N/A'}
        </div>
      </Link>
    );

  return (
    <button
      onClick={onClick}
      className={`group rounded-lg border transition duration-300 ${
        onClick || href ? 'hover:rounded-xl' : 'cursor-default'
      } ${generateOuterColor(!!onClick || !!href)} ${className || ''}`}
    >
      <div
        className={`p-1 text-center text-lg font-semibold ${
          loading ? 'text-transparent' : ''
        }`}
      >
        {title}
      </div>
      <div
        className={`border-foreground/5 bg-foreground/5 text-foreground m-2 mt-0 flex items-center justify-center rounded border p-4 text-2xl font-bold ${
          !!onClick || !!href
            ? 'transition-all duration-300 group-hover:rounded-lg'
            : ''
        } ${loading ? 'animate-pulse text-transparent' : 'text-foreground'}`}
      >
        {loading ? loadingLabel : value != null ? value : 'N/A'}
      </div>
    </button>
  );
};

export default StatisticCard;
