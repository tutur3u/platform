import Link from 'next/link';

interface Props {
  title: string;
  value?: string;
  href?: string;

  onClick?: () => void;
}

const StatisticCard = ({ title, value, href, onClick }: Props) => {
  if (href)
    return (
      <Link
        href={href}
        onClick={onClick}
        className="rounded border border-zinc-300/10 bg-zinc-300/5 transition duration-300 hover:-translate-y-1 hover:bg-zinc-300/10"
      >
        <div className="p-2 text-center text-lg font-semibold">{title}</div>
        <div className="m-4 mt-0 flex items-center justify-center rounded border border-zinc-300/20 bg-zinc-300/10 p-4 text-2xl font-bold text-zinc-300">
          {value || 'N/A'}
        </div>
      </Link>
    );

  return (
    <button
      onClick={onClick}
      className="rounded border border-zinc-300/10 bg-zinc-300/5 transition duration-300 hover:-translate-y-1 hover:bg-zinc-300/10"
    >
      <div className="p-2 text-center text-lg font-semibold">{title}</div>
      <div className="m-4 mt-0 flex items-center justify-center rounded border border-zinc-300/20 bg-zinc-300/10 p-4 text-2xl font-bold text-zinc-300">
        {value || 'N/A'}
      </div>
    </button>
  );
};

export default StatisticCard;
