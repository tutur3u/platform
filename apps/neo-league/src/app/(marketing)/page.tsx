import { AboutSection } from '@/components/about-section';
import { ContactSection } from '@/components/contact-section';
import { DatesSection } from '@/components/dates-section';
import { HeroSection } from '@/components/hero-section';
import { MentorsSection } from '@/components/mentors-section';
import { PhasesSection } from '@/components/phases-section';
import { RulesSection } from '@/components/rules-section';
import { SupportersSection } from '@/components/supporters-section';

export default function Home() {
  return (
    <div className="flex flex-col">
      <HeroSection />
      <AboutSection />
      <PhasesSection />
      <DatesSection />
      <RulesSection />
      <MentorsSection />
      <SupportersSection />
      <ContactSection />
    </div>
  );
}
