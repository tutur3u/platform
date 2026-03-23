import Events from './events';
import HeroSection from './hero-section';
import SummarizedDepartments from './summarized-departments';
import WhyUs from './why-us';

export default function MarketingPage() {
  return (
    <div className="container mx-auto flex flex-col items-center gap-6 px-8 py-16">
      <HeroSection />
      <Events />
      <WhyUs />
      <SummarizedDepartments />
    </div>
  );
}
