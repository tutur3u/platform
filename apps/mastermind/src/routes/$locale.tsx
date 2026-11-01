import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import en from '../../messages/en.json';
import vi from '../../messages/vi.json';
import { currentOwner } from '../native/context';

const ownerEmail = createServerFn({ method: 'GET' }).handler(
  () => currentOwner().email
);
export const Route = createFileRoute('/$locale')({
  loader: () => ownerEmail(),
  component: Shell,
});
function Shell() {
  const { locale } = Route.useParams();
  const messages = locale === 'vi' ? vi : en;
  return (
    <main lang={locale === 'vi' ? 'vi' : 'en'}>
      <h1>Mastermind</h1>
      <p>
        {messages.owner}: {Route.useLoaderData()}
      </p>
      <section aria-labelledby="org">
        <h2 id="org">{messages.org}</h2>
        <p>{messages.soon}</p>
      </section>
    </main>
  );
}
