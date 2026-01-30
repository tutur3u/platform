import { AboutSection } from '@/components/about-section';
import { ContactSection } from '@/components/contact-section';
import { DatesSection } from '@/components/dates-section';
import { Footer } from '@/components/footer';
import { HeroSection } from '@/components/hero-section';
import { MentorsSection } from '@/components/mentors-section';
import { PhasesSection } from '@/components/phases-section';
import { RulesSection } from '@/components/rules-section';
import { SupportersSection } from '@/components/supporters-section';

export default function Home() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <HeroSection />
      <AboutSection />
      <PhasesSection />
      <DatesSection />
      <RulesSection />
      <MentorsSection />
      <SupportersSection />
      <ContactSection />
      <Footer />
    </div>
  );
}
