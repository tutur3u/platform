import Image from 'next/image';

interface LogoTabProps {
  logoImage: string;
  svgLink: string;
  pngLink: string;
  alt: string;
  light: boolean;
}

export default function LogoTab({
  logoImage,
  svgLink,
  pngLink,
  alt,
  light,
}: LogoTabProps) {
  const bgCss = light
    ? "bg-[url('/media/background/transparent.png')]"
    : "bg-[url('/media/background/transparent-light.png')]";

  return (
    <>
      <div
        className={`${bgCss} relative flex items-center justify-center rounded-xl`}
      >
        <Image
          width={25}
          height={25}
          className="h-48 w-48"
          src={logoImage}
          alt={alt}
        />
        <div className="absolute inset-0 m-2 flex items-end justify-start gap-2 opacity-0 hover:opacity-100">
          <button
            className={`${
              light ? 'bg-zinc-600/70' : 'bg-zinc-700/70'
            } rounded px-4 py-2 text-sm font-bold text-white/50 transition duration-300 hover:text-white`}
          >
            <a href={svgLink} download>
              .svg
            </a>
          </button>
          <button
            className={`${
              light ? 'bg-zinc-600/70' : 'bg-zinc-700/70'
            } rounded px-4 py-2 text-sm font-bold text-white/50 transition duration-300 hover:text-white`}
          >
            <a href={pngLink} download>
              .png
            </a>
          </button>
        </div>
      </div>
    </>
  );
}
