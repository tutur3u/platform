import Event from './event';
import WhatIsNeo from './what-is-neo';
import WhyUs from './why-us';

export default function MarketingPage() {
  return (
    <div className="flex justify-center">
      <div className="text-foreground container flex flex-col items-center gap-6">
        <WhatIsNeo />
        <Event />
        <WhyUs />
      </div>
    </div>
  );
}
