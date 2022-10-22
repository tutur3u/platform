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
          <div className="mt-3 flex-none">
            <Image
              src="/media/logos/transparent.png"
              alt="logo"
              width={40}
              height={40}
            />
          </div>
        )}
        {showLabel && (
          <div className="text-2xl absolute left-[2.75rem] md:opacity-0 md:-translate-x-2 group-hover:static group-hover:translate-x-0 group-hover:opacity-100 transition duration-500 text-white font-semibold">
            {label}
          </div>
        )}
      </a>
    </Link>
  );
}
