import Image from 'next/image';
import Link from 'next/link';
interface LogoProps {
  showLogo?: boolean;
  showLabel?: boolean;
  alwaysShowLabel?: boolean;
  allowRedirect?: boolean;
  onClick?: () => void;
}
export default function Logo({
  showLogo = true,
  showLabel = true,
  alwaysShowLabel = false,
  allowRedirect,
  onClick,
}: LogoProps) {
  const label = 'Tuturuuu';
  const css = 'font-bold text-white text-4xl';

  return (
    <Link href={allowRedirect ? '/' : '/?no-redirect=true'} onClick={onClick}>
      <a className={`flex items-center gap-2 ${css}`}>
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
            className={`text-2xl absolute left-[2.71rem] transition duration-200 text-white font-semibold ${
              alwaysShowLabel ||
              'md:opacity-0 md:-translate-x-2 group-hover:static group-hover:translate-x-0 group-hover:opacity-100'
            }`}
          >
            {label}
          </div>
        )}
      </a>
    </Link>
  );
}
