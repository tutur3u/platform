import { useTranslations } from 'next-intl';

export const YoutubeEmbed = ({ embedId }: { embedId: string | undefined }) => {
  const t = useTranslations();

  return embedId ? (
    <iframe
      src={`https://www.youtube.com/embed/${embedId}`}
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowFullScreen
      title="Embedded youtube"
      className="w-full h-full rounded-lg"
    />
  ) : (
    <div>{t('ws-course-modules.invalid_youtube_link')}.</div>
  );
};
