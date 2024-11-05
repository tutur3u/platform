import Events from './events';
import WhatIsNeo from './what-is-neo';
import WhyUs from './why-us';

export default function MarketingPage() {
  return (
    <div className="flex justify-center">
      <div className="text-foreground container flex flex-col gap-6 items-center ">
        <WhatIsNeo />
        <Events />
        <WhyUs />
      </div>
    </div>
  );
}
