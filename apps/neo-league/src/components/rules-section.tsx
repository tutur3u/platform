import {
  AlertOctagon,
  CheckCircle2,
  Component,
  Cpu,
  Gavel,
  Trophy,
  UserCheck,
  Users,
} from '@ncthub/ui/icons';

export default function RulesSection() {
  return (
    <section
      id="rules"
      className="relative overflow-hidden px-6 py-20 md:px-8 md:py-32"
    >
      <div className="relative z-10 mx-auto max-w-7xl">
        <div className="mb-16 text-center">
          <h2 className="mb-4 text-3xl tracking-wide md:text-4xl">
            <span className="font-medium text-brand-teal italic">
              ELIGIBILITY &{' '}
            </span>
            <span className="relative inline-block font-black text-brand-teal">
              RULES
              <span className="absolute -bottom-1 left-0 h-1 w-full bg-yellow-400"></span>
            </span>
          </h2>
          <p className="mx-auto mt-4 max-w-2xl font-bold text-lg text-primary">
            The foundation for equity, inclusivity, and mutual respect
            throughout the competition. Please review these requirements
            carefully before registering.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:gap-12">
          {/* Eligibility Card */}
          <div className="group glass-card card-hover relative overflow-hidden rounded-3xl p-8 md:p-10">
            <div className="relative">
              <h3 className="mb-8 flex items-center gap-3 font-black text-2xl text-brand-teal uppercase tracking-wide">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-teal shadow-brand-teal/20 shadow-lg">
                  <CheckCircle2 className="text-white text-xl" />
                </div>
                Eligibility
              </h3>

              <ul className="grid gap-4">
                <li className="flex gap-4 rounded-xl border border-transparent bg-background/70 p-4 transition-all hover:border-brand-teal/20 hover:shadow-sm">
                  <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-light-blue/10 text-brand-light-blue">
                    <UserCheck className="h-4 w-4" />
                  </div>
                  <div>
                    <h4 className="font-bold text-foreground">Who</h4>
                    <p className="mt-1 text-muted-foreground text-sm">
                      Undergraduates <strong>over 18 years old</strong> from any
                      university in Ho Chi Minh City.
                    </p>
                  </div>
                </li>
                <li className="flex gap-4 rounded-xl border border-transparent bg-background/50 p-4 transition-all hover:border-brand-teal/20 hover:shadow-sm">
                  <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-light-blue/10 text-brand-light-blue">
                    <Users className="h-4 w-4" />
                  </div>
                  <div>
                    <h4 className="font-bold text-foreground">
                      Team Composition
                    </h4>
                    <p className="mt-1 text-muted-foreground text-sm">
                      Exact team of <strong>4 members</strong> with diverse
                      backgrounds (Business, Software, Robotics).
                    </p>
                  </div>
                </li>
                <li className="flex gap-4 rounded-xl border border-transparent bg-background/50 p-4 transition-all hover:border-brand-teal/20 hover:shadow-sm">
                  <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-light-blue/10 text-brand-light-blue">
                    <Component className="h-4 w-4" />
                  </div>
                  <div>
                    <h4 className="font-bold text-foreground">Project Type</h4>
                    <p className="mt-1 text-muted-foreground text-sm">
                      Must be <strong>functional physical prototypes</strong>.
                      Pure software solutions are excluded.
                    </p>
                  </div>
                </li>
              </ul>
            </div>
          </div>

          {/* Rules Card */}
          <div className="group glass-card card-hover relative overflow-hidden rounded-3xl p-8 md:p-10">
            <div className="relative">
              <h3 className="mb-8 flex items-center gap-3 font-black text-2xl text-brand-teal uppercase tracking-wide">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-teal shadow-brand-light-blue/20 shadow-lg">
                  <AlertOctagon className="text-white text-xl" />
                </div>
                Rules
              </h3>

              <ul className="grid gap-4">
                <li className="flex gap-4 rounded-xl border border-transparent bg-background/50 p-4 transition-all hover:border-brand-light-blue/20 hover:shadow-sm">
                  <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-light-blue/10 text-brand-light-blue">
                    <Cpu className="h-4 w-4" />
                  </div>
                  <div>
                    <h4 className="font-bold text-foreground">Originality</h4>
                    <p className="mt-1 text-muted-foreground text-sm">
                      Projects must be created specifically for NEO League
                      Season 2. No recycled work.
                    </p>
                  </div>
                </li>
                <li className="flex gap-4 rounded-xl border border-transparent bg-background/50 p-4 transition-all hover:border-brand-light-blue/20 hover:shadow-sm">
                  <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-light-blue/10 text-brand-light-blue">
                    <Gavel className="h-4 w-4" />
                  </div>
                  <div>
                    <h4 className="font-bold text-foreground">Integrity</h4>
                    <p className="mt-1 text-muted-foreground text-sm">
                      Zero tolerance for plagiarism or "ghost-building"
                      (external professional services).
                    </p>
                  </div>
                </li>
                <li className="flex gap-4 rounded-xl border border-transparent bg-background/50 p-4 transition-all hover:border-brand-light-blue/20 hover:shadow-sm">
                  <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-light-blue/10 text-brand-light-blue">
                    <Trophy className="h-4 w-4" />
                  </div>
                  <div>
                    <h4 className="font-bold text-foreground">Final Day</h4>
                    <p className="mt-1 text-muted-foreground text-sm">
                      Finalists must surrender prototypes for morning inspection
                      with a 5-minute setup window.
                    </p>
                  </div>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
