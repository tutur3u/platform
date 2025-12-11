import { Progress } from '@tuturuuu/ui/progress';
import Link from 'next/link';

interface Props {
  title?: string;
  value?: string | number | null;
  limit?: number;
  displayValue?: React.ReactNode;
  displayLimit?: React.ReactNode;
  progress?: number;
  href?: string;
  className?: string;
  onClick?: () => void;
}

const StatisticCard = ({
  title,
  value,
  limit,
  displayValue,
  displayLimit,
  progress,
  href,
  className,
  onClick,
}: Props) => {
  const generateOuterColor = (enableHoverEffect: boolean) =>
    `${
      enableHoverEffect
        ? 'border-border hover:bg-foreground/[0.025] dark:hover:bg-foreground/5'
        : 'border-border/50'
    }`;

  const progressValue =
    progress !== undefined
      ? progress
      : typeof value === 'number' && limit
        ? (value / limit) * 100
        : 0;

  const progressColor =
    progressValue >= 100
      ? 'bg-dynamic-red'
      : progressValue >= 90
        ? 'bg-dynamic-yellow'
        : '';

  const cardContent = (
    <div className="flex h-full flex-col justify-between">
      <div>
        <div className="line-clamp-1 p-1 text-center font-semibold text-lg">
          {title}
        </div>
        <div
          className={`m-2 mt-0 line-clamp-1 rounded border border-border/30 bg-foreground/5 p-4 text-center font-bold text-2xl text-foreground ${
            !!onClick || !!href
              ? 'transition-all duration-300 group-hover:rounded-lg'
              : ''
          }`}
        >
          {displayValue ?? (value != null ? value : 'N/A')}
          {(displayLimit || limit) && (
            <span className="font-normal text-base text-muted-foreground">
              {' '}
              / {displayLimit ?? limit}
            </span>
          )}
        </div>
      </div>
      {(limit || displayLimit || progress !== undefined) && (
        <div className="px-4 pb-4">
          <Progress value={progressValue} indicatorClassName={progressColor} />
        </div>
      )}
    </div>
  );

  if (href)
    return (
      <Link
        href={href}
        onClick={onClick}
        className={`group flex flex-col rounded-lg border transition-all duration-300 ${
          onClick || href ? 'hover:rounded-xl' : 'cursor-default'
        } ${generateOuterColor(!!onClick || !!href)} ${className || ''}`}
      >
        {cardContent}
      </Link>
    );

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex flex-col rounded-lg border transition duration-300 ${
        onClick || href ? 'hover:rounded-xl' : 'cursor-default'
      } ${generateOuterColor(!!onClick || !!href)} ${className || ''}`}
    >
      {cardContent}
    </button>
  );
};

export default StatisticCard;
