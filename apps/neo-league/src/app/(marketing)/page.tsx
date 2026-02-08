import AboutClubSection from '@/components/about-club-section';
import AboutNeoLeagueSection from '@/components/about-neo-league-section';
import ContactSection from '@/components/contact-section';
import DatesSection from '@/components/dates-section';
import HeroSection from '@/components/hero-section';
import MentorsSection from '@/components/mentors-section';
import OrganizersSection from '@/components/organizers-section';
import OrganizersTeamSection from '@/components/organizers-team-section';
import PhasesSection from '@/components/phases-section';
import RulesSection from '@/components/rules-section';
import SponsorsSection from '@/components/sponsors-section';

export default function Home() {
  return (
    <div className="flex flex-col">
      <HeroSection />
      <AboutClubSection />
      <AboutNeoLeagueSection />
      <SponsorsSection />
      <PhasesSection />
      <DatesSection />
      <RulesSection />
      <MentorsSection />
      <OrganizersTeamSection />
      <OrganizersSection />
      <ContactSection />
    </div>
  );
}
