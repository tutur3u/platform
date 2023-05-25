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
      <div className={`${bgCss} relative flex items-center justify-center p-4`}>
        <Image
          width={25}
          height={25}
          className="h-full w-full"
          src={logoImage}
          alt={alt}
        />
        <div className="absolute inset-0 flex items-center justify-center gap-5 opacity-0 hover:opacity-100">
          <button className="rounded bg-black/90 px-4 py-2 text-sm font-bold text-white/50 transition duration-300 hover:text-white">
            <a href={svgLink} download>
              .svg
            </a>
          </button>
          <button className="rounded bg-black/90 px-4 py-2 text-sm font-bold text-white/50 transition duration-300 hover:text-white">
            <a href={pngLink} download>
              .png
            </a>
          </button>
        </div>
      </div>
    </>
  );
}
