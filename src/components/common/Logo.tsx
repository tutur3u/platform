import Image from 'next/image';
import Link from 'next/link';

interface LogoProps {
  showLogo?: boolean;
  showLabel?: boolean;
  allowRedirect?: boolean;
  onClick?: () => void;
}

export default function Logo({
  showLogo = true,
  showLabel,
  allowRedirect,
  onClick,
}: LogoProps) {
  const label = 'Tuturuuu';
  const css = 'font-bold text-white text-4xl';

  return (
    <Link href={allowRedirect ? '/' : '/?no-redirect=true'} onClick={onClick}>
      <a className={`flex items-center gap-2 ${css}`}>
        {showLogo && (
          <div className="mt-1">
            <Image
              src="/media/logos/transparent.png"
              alt="logo"
              width={32}
              height={32}
            />
          </div>
        )}
        {showLabel && (
          <div className="text-2xl text-white font-semibold">{label}</div>
        )}
      </a>
    </Link>
  );
}
