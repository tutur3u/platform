import History from './history';
import Members from './members';

export default function AboutPage() {
  return (
    <div className="space-y-6 py-16">
      <section className="container max-w-6xl">
        <History />
      </section>
      <section className="container">
        <Members />
      </section>
    </div>
  );
}
