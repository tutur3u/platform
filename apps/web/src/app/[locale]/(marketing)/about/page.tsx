import Departments from './departments';
import History from './history';
import Members from './members';

export default function AboutPage() {
  return (
    <div className="container mx-auto px-4 py-16">
      <section className="mb-6">
        <History />
      </section>
      <section className="mb-6">
        <Members />
      </section>
      <section className="mb-6">
        <Departments />
      </section>
    </div>
  );
}
