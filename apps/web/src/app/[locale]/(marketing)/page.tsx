import Events from './events';
import HeroSection from './hero-section';
import WhyUs from './why-us';

export default function MarketingPage() {
  return (
    <div className="flex justify-center">
      <div className="container flex flex-col items-center gap-6 text-foreground">
        <HeroSection />
        <Events />
        <WhyUs />
      </div>
    </div>
  );
}
