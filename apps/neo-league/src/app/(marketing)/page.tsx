import AboutClubSection from '@/components/about-club-section';
import AboutNeoLeagueSection from '@/components/about-neo-league-section';
import AnimatedSection from '@/components/animated-section';
import DatesSection from '@/components/dates-section';
import HeroSection from '@/components/hero-section';
import JsonLd from '@/components/json-ld';
import MentorsSection from '@/components/mentors-section';
import OrganizersSection from '@/components/organizers-section';
import OrganizersTeamSection from '@/components/organizers-team-section';
import PhasesSection from '@/components/phases-section';
import RulesSection from '@/components/rules-section';
import SponsorsSection from '@/components/sponsors-section';

export default function Home() {
  return (
    <div className="gradient-background flex flex-col overflow-hidden">
      <JsonLd />
      <AnimatedSection>
        <HeroSection />
      </AnimatedSection>
      <AboutClubSection />
      <AboutNeoLeagueSection />
      <SponsorsSection />
      <PhasesSection />
      <DatesSection />
      <AnimatedSection>
        <RulesSection />
      </AnimatedSection>
      <MentorsSection />
      <OrganizersTeamSection />
      <OrganizersSection />
    </div>
  );
}
