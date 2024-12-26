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
      className="aspect-video h-48 w-full rounded-lg md:h-64 lg:h-96"
    />
  ) : (
    <div>{t('ws-course-modules.invalid_youtube_link')}.</div>
  );
};
