'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@ncthub/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@ncthub/ui/tabs';
import { getInitials } from '@ncthub/utils/name-helper';
import AnimatedSection from '../animated-section';
import AvatarCard from '../avatar-card';
import { leaders, teams } from './data';

export default function OrganizersTeamSection() {
  return (
    <section id="organizing-team" className="px-6 py-20 md:px-8 md:py-24">
      <div className="mx-auto max-w-6xl">
        {/* Section Header */}
        <div className="mb-16 text-center">
          <h2 className="mb-4 font-black text-3xl shadow-text md:text-4xl">
            ORGANIZING <span className="text-secondary">TEAM</span>
          </h2>
          <p className="mx-auto max-w-2xl text-foreground/70 text-lg">
            Meet the dedicated student organizers bringing NEO League 2026 to
            life.
          </p>
        </div>

        {leaders.length > 0 && (
          <div className="mb-16">
            <h3 className="mb-8 text-center font-bold text-2xl">
              <span className="text-primary">Project Leaders</span>
            </h3>
            <div className="flex flex-wrap justify-center gap-8">
              {leaders.map((leader, index) => (
                <AnimatedSection key={index} delay={index * 0.1}>
                  <AvatarCard
                    avatar={leader.avatar || ''}
                    name={leader.name}
                    subtitle={leader.role || ''}
                    avatarClassName="ease-in-out transition-transform duration-500 hover:scale-105"
                    fallbackClassName="text-3xl"
                    containerClassName="w-72"
                    cardClassName="rounded-2xl px-8 py-12"
                    nameClassName="mb-2 text-xl"
                    subtitleClassName="font-medium text-lg text-secondary"
                  />
                </AnimatedSection>
              ))}
            </div>
          </div>
        )}

        <div>
          <h3 className="mb-8 text-center font-bold text-2xl">
            <span className="text-primary">Teams</span>
          </h3>

          <Tabs defaultValue={teams[0]?.name} className="w-full">
            {/* Tab Triggers */}
            <TabsList className="mx-auto mb-8 flex h-auto w-full flex-wrap justify-center gap-2 bg-transparent p-0 text-dark">
              {teams.map((team) => (
                <TabsTrigger
                  key={team.name}
                  value={team.name}
                  className="data-[state=active]:gradient-bg rounded-full border border-foreground/10 bg-foreground/5 px-5 py-2.5 font-bold text-sm transition-all data-[state=active]:border-transparent data-[state=active]:text-black"
                >
                  {team.name}
                </TabsTrigger>
              ))}
            </TabsList>

            {/* Tab Contents */}
            {teams.map((team) => (
              <TabsContent key={team.name} value={team.name}>
                <div className="glass-card rounded-2xl p-8">
                  {/* Team Role/Description */}
                  <div className="mb-8 text-center">
                    <div className="gradient-bg mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl">
                      <span className="font-black text-2xl text-white">
                        {team.name.charAt(0)}
                      </span>
                    </div>
                    <h4 className="mb-2 font-black text-xl">{team.name}</h4>
                    <p className="mx-auto max-w-xl text-base text-foreground/70">
                      {team.description}
                    </p>
                  </div>

                  {/* Team Members Grid */}
                  <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                    {team.members.map((member, memberIndex) => (
                      <AnimatedSection
                        key={memberIndex}
                        delay={
                          Math.floor(memberIndex / 5) * 0.08 +
                          (memberIndex % 5) * 0.03
                        }
                      >
                        <div className="group flex flex-col items-center text-center">
                          <Avatar className="mb-3 h-20 w-20 transition-transform duration-300 group-hover:scale-110 sm:h-24 sm:w-24">
                            <AvatarImage
                              src={member.avatar}
                              alt={member.name}
                            />
                            <AvatarFallback className="bg-secondary/20 font-bold text-lg">
                              {getInitials(member.name)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="font-semibold text-foreground text-sm">
                            {member.name}
                          </span>
                          {member.role && (
                            <span className="text-foreground/60 text-xs">
                              {member.role}
                            </span>
                          )}
                        </div>
                      </AnimatedSection>
                    ))}
                  </div>
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </div>
      </div>
    </section>
  );
}
