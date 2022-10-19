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
  const label = 'Lora';
  const css = 'font-bold text-white text-4xl';

  return (
    <Link href={allowRedirect ? '/' : '/?no-redirect=true'} onClick={onClick}>
      <a className={`flex gap-2 ${css}`}>
        {showLogo && (
          <div className="mt-1">
            <Image
              src="/media/logos/transparent.png"
              alt="logo"
              width={40}
              height={40}
            />
          </div>
        )}
        {showLabel && (
          <div className="translate-y-0.5 text-4xl text-sky-200 font-semibold">
            {label}
          </div>
        )}
      </a>
    </Link>
  );
}
