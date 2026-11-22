import { createFileRoute, notFound, Outlet } from '@tanstack/react-router';
import { I18nProvider, isLocaleParam, routeLocale } from '../../i18n';

// The default locale has no prefix (`/`, `/ship`); Vietnamese keeps `/vi`.
// This layout only validates the locale and provides it; each page keeps its
// own loader, so the command center loader never runs for Ship or Projects.
export const Route = createFileRoute('/{-$locale}')({
  beforeLoad: ({ params }) => {
    if (!isLocaleParam(params.locale)) throw notFound();
  },
  component: LocaleLayout,
});

function LocaleLayout() {
  const { locale } = Route.useParams();
  return (
    <I18nProvider locale={routeLocale(locale)}>
      <Outlet />
    </I18nProvider>
  );
}
