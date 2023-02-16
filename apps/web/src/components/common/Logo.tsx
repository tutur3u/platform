import Image from 'next/image';
import Link from 'next/link';

interface LogoProps {
  root?: boolean;
  showLogo?: boolean;
  showLabel?: boolean;
  alwaysShowLabel?: boolean;
  onClick?: () => void;
}

export default function Logo({
  root = true,
  showLogo = true,
  showLabel = true,
  alwaysShowLabel = false,
  onClick,
}: LogoProps) {
  const label = 'Tuturuuu';
  const css = 'font-bold text-white text-4xl';

  return (
    <Link
      href={root ? '/' : '/home'}
      onClick={onClick}
      className={`flex items-center gap-2 ${css}`}
    >
      {showLogo && (
        <div className="flex-none translate-y-0.5">
          <Image
            src="/media/logos/transparent.png"
            alt="logo"
            width={32}
            height={32}
          />
        </div>
      )}
      {showLabel && (
        <div
          className={`absolute left-[2.71rem] text-2xl font-semibold text-white transition duration-200 ${
            alwaysShowLabel ||
            'group-hover:static group-hover:translate-x-0 group-hover:opacity-100 md:-translate-x-2 md:opacity-0'
          }`}
        >
          {label}
        </div>
      )}
    </Link>
  );
}
