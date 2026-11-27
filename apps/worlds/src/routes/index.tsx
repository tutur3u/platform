import { createFileRoute } from '@tanstack/react-router';
import { objectBounds, type World } from '@tuturuuu/worlds';
import hall from '@tuturuuu/worlds/edufest-hall.json';

const world = hall as World;
const copy = {
  en: {
    title: 'EduFest hall',
    entrance: 'Entrance',
    stage: 'Stage',
    booth: 'Booth',
    map: 'Hall floor plan',
  },
  vi: {
    title: 'Hội trường EduFest',
    entrance: 'Lối vào',
    stage: 'Sân khấu',
    booth: 'Gian',
    map: 'Sơ đồ hội trường',
  },
};

export const Route = createFileRoute('/')({
  validateSearch: (search: Record<string, unknown>) => ({
    lang: search.lang === 'vi' ? ('vi' as const) : ('en' as const),
  }),
  component: Hall,
});

function Hall() {
  const { lang } = Route.useSearch();
  const labels = copy[lang];
  const { width, depth } = world.bounds;
  return (
    <main>
      <header>
        <h1>{labels.title}</h1>
        <nav aria-label={lang === 'vi' ? 'Ngôn ngữ' : 'Language'}>
          <a
            href="/?lang=en"
            lang="en"
            aria-current={lang === 'en' ? 'true' : undefined}
          >
            English
          </a>
          <a
            href="/?lang=vi"
            lang="vi"
            aria-current={lang === 'vi' ? 'true' : undefined}
          >
            Tiếng Việt
          </a>
        </nav>
      </header>
      <section
        className="map"
        aria-label={labels.map}
        style={{ aspectRatio: width / depth }}
      >
        {world.objects.map((object) => {
          const { min, max } = objectBounds(object);
          const label =
            object.kind === 'booth'
              ? `${labels.booth} ${Number(object.id.slice(1))}`
              : labels.stage;
          return (
            <span
              key={object.id}
              className={object.kind}
              aria-label={label}
              title={label}
              style={{
                left: `${(100 * min.x) / width}%`,
                top: `${(100 * min.z) / depth}%`,
                width: `${(100 * (max.x - min.x)) / width}%`,
                height: `${(100 * (max.z - min.z)) / depth}%`,
              }}
            >
              {object.kind === 'booth'
                ? Number(object.id.slice(1))
                : labels.stage}
            </span>
          );
        })}
        {world.spawns.map(({ x, z }) => (
          <span
            className="spawn"
            key={`${x}:${z}`}
            style={{
              left: `${(100 * x) / width}%`,
              top: `${(100 * z) / depth}%`,
            }}
          >
            {labels.entrance}
          </span>
        ))}
      </section>
    </main>
  );
}
