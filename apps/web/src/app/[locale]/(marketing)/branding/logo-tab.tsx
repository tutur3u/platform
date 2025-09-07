import Image from 'next/image';

interface LogoTabProps {
  logoImage: string;
  pngLink: string;
  svgLink?: string;
  alt: string;
  light?: boolean;
}

export default function LogoTab({
  logoImage,
  svgLink,
  pngLink,
  alt,
  light = false,
}: LogoTabProps) {
  const bgCss = light
    ? "bg-[url('/media/background/transparent.png')]"
    : "bg-[url('/media/background/transparent-light.png')]";

  return (
    <div
      className={`${bgCss} relative flex items-center justify-center rounded-lg p-8`}
    >
      <Image
        height={768}
        width={640}
        className="h-48 w-48"
        src={logoImage}
        alt={alt}
      />

      <div className="absolute inset-0 m-2 flex items-end justify-start gap-2 opacity-0 hover:opacity-100">
        {svgLink && (
          <a
            href={svgLink}
            className={`rounded bg-black/70 px-4 py-2 font-bold text-sm text-white/70 transition duration-300 hover:bg-black hover:text-white`}
            download
          >
            .svg
          </a>
        )}
        {pngLink && (
          <a
            href={pngLink}
            className={`rounded bg-black/70 px-4 py-2 font-bold text-sm text-white/70 transition duration-300 hover:bg-black hover:text-white`}
            download
          >
            .png
          </a>
        )}
      </div>
    </div>
  );
}
