import Image from 'next/image';
import Link from 'next/link';

interface LogoProps {
  showLogo?: boolean;
  showLabel?: boolean;
  allowRedirect?: boolean;
  onClick?: () => void;
  className?: string;
}

export default function Logo({
  showLogo = true,
  showLabel,
  allowRedirect,
  onClick,
  className,
}: LogoProps) {
  const label = 'Tuturuuu';
  const css = 'font-bold text-white text-4xl';

  return (
    <Link
      className={`${className}`}
      href={allowRedirect ? '/' : '/?no-redirect=true'}
      onClick={onClick}
    >
      <a className={`flex items-center gap-2 ${css}`}>
        {showLogo && (
          <Image
            src="/media/logos/transparent.png"
            alt="logo"
            width={37}
            height={37}
          />
        )}
        {showLabel && (
          <div className="text-2xl absolute left-14 md:opacity-0 md:-translate-x-2 group-hover:static group-hover:translate-x-0 group-hover:opacity-100 transition duration-500 text-white font-semibold">
            {label}
          </div>
        )}
      </a>
    </Link>
  );
}
