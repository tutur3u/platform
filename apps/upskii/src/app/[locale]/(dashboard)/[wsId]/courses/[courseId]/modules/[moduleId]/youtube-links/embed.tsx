import { useTranslations } from 'next-intl';

export const YoutubeEmbed = ({ embedId }: { embedId: string | undefined }) => {
  const t = useTranslations();

  return embedId ? (
    <iframe
      width="853"
      height="480"
      src={`https://www.youtube.com/embed/${embedId}`}
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowFullScreen
      title="Embedded youtube"
      className="aspect-video h-64 w-full rounded-lg md:h-96 lg:h-[600px]"
    />
  ) : (
    <div>{t('ws-course-modules.invalid_youtube_link')}.</div>
  );
};
