import Link from 'next/link';

interface Props {
  title?: string;
  value?: string | number | null;
  href?: string;
  className?: string;
  onClick?: () => void;
}

const StatisticCard = ({ title, value, href, className, onClick }: Props) => {
  const generateOuterColor = (enableHoverEffect: boolean) =>
    `${
      enableHoverEffect
        ? 'border-border hover:bg-foreground/[0.025] dark:hover:bg-foreground/5'
        : 'border-border/50'
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
        <div className="line-clamp-1 p-1 text-center text-lg font-semibold">
          {title}
        </div>
        <div
          className={`m-2 mt-0 line-clamp-1 rounded border border-border/30 bg-foreground/5 p-4 text-center text-2xl font-bold text-foreground ${
            !!onClick || !!href
              ? 'transition-all duration-300 group-hover:rounded-lg'
              : ''
          }`}
        >
          {value != null ? value : 'N/A'}
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
      <div className="line-clamp-1 p-1 text-center text-lg font-semibold">
        {title}
      </div>
      <div
        className={`m-2 mt-0 line-clamp-1 rounded border border-border/30 bg-foreground/5 p-4 text-center text-2xl font-bold text-foreground ${
          !!onClick || !!href
            ? 'transition-all duration-300 group-hover:rounded-lg'
            : ''
        }`}
      >
        {value != null ? value : 'N/A'}
      </div>
    </button>
  );
};

export default StatisticCard;
