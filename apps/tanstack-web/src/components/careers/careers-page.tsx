import {
  ArrowRight,
  Bot,
  Brain,
  Building2,
  CheckCircle2,
  Code2,
  Cpu,
  Database,
  GithubIcon,
  Globe,
  GraduationCap,
  Heart,
  Laptop,
  Layers,
  Lightbulb,
  Mail,
  MapPin,
  MessageSquare,
  Rocket,
  Shield,
  Sparkles,
  Star,
  Target,
  Users,
  Zap,
} from '@tuturuuu/icons/lucide';

const values = [
  {
    icon: Zap,
    title: 'Focus is the New Superpower',
    description:
      'In a world engineered for distraction, we build technology that protects and amplifies deep work.',
    tone: 'text-dynamic-yellow bg-dynamic-yellow/10 border-dynamic-yellow/20',
  },
  {
    icon: Heart,
    title: 'Technology Serves Humanity',
    description:
      'We create software as an extension of human will, not a cage for attention.',
    tone: 'text-dynamic-red bg-dynamic-red/10 border-dynamic-red/20',
  },
  {
    icon: Shield,
    title: 'Radical Transparency',
    description:
      'Open-source at our core. Foundational technology should never be a black box.',
    tone: 'text-dynamic-blue bg-dynamic-blue/10 border-dynamic-blue/20',
  },
  {
    icon: Target,
    title: 'Impact Over Activity',
    description:
      'Productivity is about creating value, not just doing more. We free minds for breakthroughs.',
    tone: 'text-dynamic-green bg-dynamic-green/10 border-dynamic-green/20',
  },
  {
    icon: Globe,
    title: 'Potential Has No Postcode',
    description:
      'World-class tools should be accessible from any street, village, or classroom.',
    tone: 'text-dynamic-purple bg-dynamic-purple/10 border-dynamic-purple/20',
  },
  {
    icon: Lightbulb,
    title: 'Building the Third Era',
    description:
      'Moving from passive tools and attention platforms to proactive AI partners.',
    tone: 'text-dynamic-orange bg-dynamic-orange/10 border-dynamic-orange/20',
  },
];

const roles = [
  {
    icon: Code2,
    area: 'Engineering',
    description:
      'Build the intelligent OS for modern work. Shape Aurora, Mira, and our entire application suite.',
    positions: [
      'Full-Stack Engineers',
      'AI/ML Engineers',
      'Frontend Engineers',
      'Backend Engineers',
      'DevOps Engineers',
    ],
    tone: 'text-dynamic-blue bg-dynamic-blue/10',
  },
  {
    icon: Brain,
    area: 'AI & Research',
    description:
      'Pioneer the Third Era. Work on Mira, Aurora context graphs, and Nova alignment.',
    positions: [
      'AI Researchers',
      'Prompt Engineers',
      'ML Platform Engineers',
      'NLP Specialists',
    ],
    tone: 'text-dynamic-purple bg-dynamic-purple/10',
  },
  {
    icon: Sparkles,
    area: 'Product & Design',
    description:
      'Craft experiences that eliminate friction. Design the future of human-AI collaboration.',
    positions: [
      'Product Managers',
      'UX/UI Designers',
      'Design Engineers',
      'User Researchers',
    ],
    tone: 'text-dynamic-pink bg-dynamic-pink/10',
  },
  {
    icon: Users,
    area: 'Growth & Operations',
    description:
      'Scale our impact. Build the community flywheel and operational excellence.',
    positions: [
      'Growth Marketers',
      'Community Managers',
      'Operations Specialists',
      'Business Development',
    ],
    tone: 'text-dynamic-green bg-dynamic-green/10',
  },
];

const benefits = [
  {
    icon: Laptop,
    title: 'Flexible Work',
    description:
      'Work when you are most productive. Remote-friendly with Vietnam hub.',
  },
  {
    icon: GraduationCap,
    title: 'Learning Budget',
    description:
      'Industry-leading resources for courses, conferences, and growth.',
  },
  {
    icon: Heart,
    title: 'Premium Benefits',
    description:
      'Top-tier health coverage, wellness programs, and comprehensive package.',
  },
  {
    icon: Users,
    title: 'Team Events',
    description:
      'Regular activities to build connections, with plans for global expansion.',
  },
  {
    icon: Rocket,
    title: 'Equity & Impact',
    description:
      'Share in our success with meaningful equity and shape technology history.',
  },
  {
    icon: Globe,
    title: 'Global Opportunities',
    description: 'Work with world-class talent from Vietnam to the world.',
  },
];

const techStack = [
  {
    category: 'Frontend',
    icon: Code2,
    technologies: ['Next.js', 'React', 'TypeScript', 'Tailwind CSS'],
  },
  {
    category: 'Backend',
    icon: Database,
    technologies: ['Supabase', 'PostgreSQL', 'tRPC', 'Vercel AI SDK'],
  },
  {
    category: 'AI/ML',
    icon: Brain,
    technologies: ['OpenAI', 'Anthropic', 'Google Gemini', 'LangChain'],
  },
  {
    category: 'Infrastructure',
    icon: Layers,
    technologies: ['Vercel', 'Turborepo', 'Bun', 'Docker'],
  },
];

export function CareersPage() {
  return (
    <main className="relative mx-auto w-full overflow-x-hidden text-balance">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute top-0 -left-32 h-96 w-96 rounded-full bg-linear-to-br from-dynamic-purple/40 via-dynamic-pink/30 to-transparent blur-3xl sm:-left-64 sm:h-[40rem] sm:w-[40rem]" />
        <div className="absolute top-[40%] -right-32 h-80 w-80 rounded-full bg-linear-to-br from-dynamic-blue/40 via-dynamic-cyan/30 to-transparent blur-3xl sm:-right-64 sm:h-[35rem] sm:w-[35rem]" />
      </div>

      <section className="relative px-4 pt-24 pb-16 sm:px-6 sm:pt-32 sm:pb-20 lg:px-8 lg:pt-40 lg:pb-24">
        <div className="mx-auto max-w-7xl">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div>
              <span className="mb-6 inline-flex items-center rounded-md border border-dynamic-green/30 bg-dynamic-green/10 px-2.5 py-1 font-semibold text-dynamic-green text-xs">
                <Rocket className="mr-1.5 h-3.5 w-3.5" />
                Join the Mission
              </span>
              <h1 className="mb-6 text-balance font-bold text-4xl tracking-tight sm:text-5xl md:text-6xl lg:text-7xl">
                Build the Future of{' '}
                <span className="bg-linear-to-r from-dynamic-blue via-dynamic-purple to-dynamic-pink bg-clip-text text-transparent">
                  Human Potential
                </span>
              </h1>
              <p className="mb-8 max-w-2xl text-foreground/70 text-lg leading-relaxed sm:text-xl">
                Join Tuturuuu as we create open, AI-native tools that protect
                deep work and unlock human potential from Vietnam to the world.
              </p>
              <div className="flex flex-col gap-3 sm:flex-row">
                <a
                  href="mailto:contact@tuturuuu.com"
                  className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-8 font-medium text-primary-foreground text-sm shadow-sm transition hover:bg-primary/90"
                >
                  <Mail className="mr-2 h-4 w-4" />
                  Send Your Profile
                </a>
                <a
                  href="https://github.com/tutur3u/tuturuuu"
                  className="inline-flex h-11 items-center justify-center rounded-md border border-input bg-background px-8 font-medium text-sm shadow-xs transition hover:bg-accent hover:text-accent-foreground"
                >
                  <GithubIcon className="mr-2 h-4 w-4" />
                  View GitHub
                </a>
              </div>
            </div>
            <div className="rounded-3xl border border-border/50 bg-card/80 p-8 shadow-2xl backdrop-blur-sm">
              <div className="mb-6 flex items-center gap-4">
                <div className="rounded-2xl bg-dynamic-blue/10 p-4 text-dynamic-blue">
                  <Bot className="h-8 w-8" />
                </div>
                <div>
                  <h2 className="font-semibold text-2xl">Tuturuuu Team</h2>
                  <p className="text-muted-foreground">
                    Vietnam-rooted, globally ambitious.
                  </p>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {[
                  { label: 'Open source', icon: Shield },
                  { label: 'AI-native', icon: Cpu },
                  { label: 'Remote-friendly', icon: Globe },
                  { label: 'Builder culture', icon: Building2 },
                ].map(({ icon: Icon, label }) => (
                  <div
                    key={label}
                    className="rounded-2xl border border-border/50 bg-background/60 p-4"
                  >
                    <Icon className="mb-3 h-6 w-6 text-dynamic-blue" />
                    <div className="font-medium">{label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-12 text-center">
            <h2 className="mb-4 font-bold text-3xl tracking-tight sm:text-4xl">
              What We Value
            </h2>
            <p className="mx-auto max-w-2xl text-foreground/70 text-lg">
              Our operating principles shape the products we build and the way
              we work.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {values.map((value) => (
              <div
                key={value.title}
                className="rounded-xl border border-border/50 bg-card/80 p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
              >
                <div
                  className={`mb-4 inline-flex rounded-2xl border p-3 ${value.tone}`}
                >
                  <value.icon className="h-6 w-6" />
                </div>
                <h3 className="mb-2 font-semibold text-xl">{value.title}</h3>
                <p className="text-muted-foreground">{value.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-12 text-center">
            <h2 className="mb-4 font-bold text-3xl tracking-tight sm:text-4xl">
              Open Areas
            </h2>
            <p className="mx-auto max-w-2xl text-foreground/70 text-lg">
              We are always looking for excellent builders across these domains.
            </p>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            {roles.map((role) => (
              <article
                key={role.area}
                className="rounded-xl border border-border/50 bg-card/80 p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
              >
                <div className="mb-5 flex items-start gap-4">
                  <div className={`rounded-2xl p-3 ${role.tone}`}>
                    <role.icon className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-2xl">{role.area}</h3>
                    <p className="mt-2 text-muted-foreground">
                      {role.description}
                    </p>
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {role.positions.map((position) => (
                    <div
                      key={position}
                      className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm"
                    >
                      <CheckCircle2 className="h-4 w-4 text-dynamic-green" />
                      {position}
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.8fr_1fr]">
          <div>
            <span className="mb-4 inline-flex items-center rounded-md border border-dynamic-orange/30 bg-dynamic-orange/10 px-2.5 py-1 font-semibold text-dynamic-orange text-xs">
              <Star className="mr-1.5 h-3.5 w-3.5" />
              Benefits
            </span>
            <h2 className="mb-4 font-bold text-3xl tracking-tight sm:text-4xl">
              Built for Serious Builders
            </h2>
            <p className="text-foreground/70 text-lg">
              We invest in the environment, tools, and ownership needed for
              people to do their strongest work.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {benefits.map((benefit) => (
              <div
                key={benefit.title}
                className="rounded-2xl border border-border/50 bg-background/70 p-5"
              >
                <benefit.icon className="mb-3 h-6 w-6 text-dynamic-blue" />
                <h3 className="mb-2 font-semibold">{benefit.title}</h3>
                <p className="text-muted-foreground text-sm">
                  {benefit.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-10 text-center">
            <h2 className="mb-4 font-bold text-3xl tracking-tight sm:text-4xl">
              Technology We Use
            </h2>
            <p className="mx-auto max-w-2xl text-foreground/70 text-lg">
              Modern tools for fast, reliable, AI-powered product development.
            </p>
          </div>
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {techStack.map((stack) => (
              <div
                key={stack.category}
                className="rounded-xl border border-border/50 bg-card/80 p-5 shadow-sm"
              >
                <stack.icon className="mb-4 h-7 w-7 text-dynamic-blue" />
                <h3 className="mb-3 font-semibold">{stack.category}</h3>
                <div className="flex flex-wrap gap-2">
                  {stack.technologies.map((technology) => (
                    <span
                      key={technology}
                      className="rounded-full bg-muted px-2.5 py-1 text-muted-foreground text-xs"
                    >
                      {technology}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl rounded-3xl border border-dynamic-purple/20 bg-linear-to-br from-dynamic-purple/10 via-background to-dynamic-blue/10 p-8 text-center shadow-xl md:p-12">
          <MessageSquare className="mx-auto mb-6 h-12 w-12 text-dynamic-purple" />
          <h2 className="mb-4 font-bold text-3xl tracking-tight">
            Tell Us What You Want to Build
          </h2>
          <p className="mx-auto mb-8 max-w-2xl text-foreground/70 text-lg">
            We care less about perfect role matching and more about ownership,
            taste, and the ability to ship meaningful work.
          </p>
          <a
            href="mailto:contact@tuturuuu.com"
            className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-8 font-medium text-primary-foreground text-sm shadow-sm transition hover:bg-primary/90"
          >
            Start the Conversation
            <ArrowRight className="ml-2 h-4 w-4" />
          </a>
          <div className="mt-6 flex items-center justify-center gap-2 text-muted-foreground text-sm">
            <MapPin className="h-4 w-4" />
            Vietnam hub, global team
          </div>
        </div>
      </section>
    </main>
  );
}
