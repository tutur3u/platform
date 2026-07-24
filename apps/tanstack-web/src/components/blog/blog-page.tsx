import {
  ArrowRight,
  BookText,
  Brain,
  Code2,
  Globe,
  Laptop,
  Lightbulb,
  Mail,
  Rocket,
  Search,
  TrendingUp,
  Users,
  Zap,
} from '@tuturuuu/icons/lucide';

const categories = [
  {
    name: 'AI & Technology',
    icon: Brain,
    description: 'Latest trends in artificial intelligence and emerging tech',
    tone: 'text-dynamic-purple bg-dynamic-purple/10 border-dynamic-purple/20',
  },
  {
    name: 'Engineering',
    icon: Code2,
    description: 'Software development practices and technical insights',
    tone: 'text-dynamic-blue bg-dynamic-blue/10 border-dynamic-blue/20',
  },
  {
    name: 'Productivity',
    icon: Zap,
    description: 'Tips and strategies to maximize your efficiency',
    tone: 'text-dynamic-yellow bg-dynamic-yellow/10 border-dynamic-yellow/20',
  },
  {
    name: 'Innovation',
    icon: Lightbulb,
    description: 'Breakthrough ideas and creative problem-solving',
    tone: 'text-dynamic-orange bg-dynamic-orange/10 border-dynamic-orange/20',
  },
  {
    name: 'Business',
    icon: Globe,
    description: 'Strategy, growth, and entrepreneurship insights',
    tone: 'text-dynamic-green bg-dynamic-green/10 border-dynamic-green/20',
  },
  {
    name: 'Development',
    icon: Laptop,
    description: 'Modern development tools and workflows',
    tone: 'text-dynamic-cyan bg-dynamic-cyan/10 border-dynamic-cyan/20',
  },
];

const upcomingTopics = [
  {
    title: 'Building Mira: Our Journey to Creating a JARVIS for Everyone',
    category: 'AI & Technology',
    icon: Brain,
    readTime: '12 min read',
    tone: 'text-dynamic-purple bg-dynamic-purple/10',
  },
  {
    title:
      'The Third Era of Technology: From Passive Tools to Proactive Partners',
    category: 'Innovation',
    icon: Lightbulb,
    readTime: '8 min read',
    tone: 'text-dynamic-orange bg-dynamic-orange/10',
  },
  {
    title: 'Open Source at Scale: Lessons from Building Tuturuuu',
    category: 'Engineering',
    icon: Code2,
    readTime: '15 min read',
    tone: 'text-dynamic-blue bg-dynamic-blue/10',
  },
  {
    title: 'Eliminating Digital Friction: A Product Design Philosophy',
    category: 'Productivity',
    icon: Zap,
    readTime: '10 min read',
    tone: 'text-dynamic-yellow bg-dynamic-yellow/10',
  },
  {
    title: 'Building from Vietnam: Creating World-Class Technology Locally',
    category: 'Business',
    icon: Globe,
    readTime: '7 min read',
    tone: 'text-dynamic-green bg-dynamic-green/10',
  },
  {
    title: 'Modern Monorepo Architecture: Our Tech Stack Explained',
    category: 'Development',
    icon: Laptop,
    readTime: '18 min read',
    tone: 'text-dynamic-cyan bg-dynamic-cyan/10',
  },
];

export function BlogPage() {
  return (
    <main className="relative mx-auto w-full overflow-x-hidden text-balance">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute top-0 -left-32 h-96 w-96 rounded-full bg-linear-to-br from-dynamic-purple/40 via-dynamic-pink/30 to-transparent blur-3xl sm:-left-64 sm:h-[40rem] sm:w-[40rem]" />
        <div className="absolute top-[40%] -right-32 h-80 w-80 rounded-full bg-linear-to-br from-dynamic-blue/40 via-dynamic-cyan/30 to-transparent blur-3xl sm:-right-64 sm:h-[35rem] sm:w-[35rem]" />
        <div className="absolute -bottom-32 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-linear-to-br from-dynamic-green/30 via-dynamic-emerald/20 to-transparent blur-3xl sm:-bottom-64 sm:h-[45rem] sm:w-[45rem]" />
      </div>

      <section className="relative px-4 pt-24 pb-16 sm:px-6 sm:pt-32 sm:pb-20 lg:px-8 lg:pt-40 lg:pb-24">
        <div className="mx-auto max-w-7xl text-center">
          <span className="mb-6 inline-flex items-center rounded-md border border-dynamic-purple/30 bg-dynamic-purple/10 px-2.5 py-1 font-semibold text-dynamic-purple text-xs">
            <BookText className="mr-1.5 h-3.5 w-3.5" />
            Blog
          </span>
          <h1 className="mb-6 text-balance font-bold text-4xl tracking-tight sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl">
            Coming,{' '}
            <span className="bg-linear-to-r from-dynamic-purple via-dynamic-pink to-dynamic-orange bg-clip-text text-transparent">
              not yet
            </span>
          </h1>
          <p className="mx-auto mb-8 max-w-3xl text-balance text-base text-foreground/70 leading-relaxed sm:text-lg md:text-xl lg:text-2xl">
            Exploring the future of technology, productivity, and human
            potential. Deep dives into AI, engineering, and building products
            that matter.
          </p>
          <div className="mb-12 flex flex-col flex-wrap items-center justify-center gap-3 sm:flex-row sm:gap-4">
            <a
              href="#upcoming"
              className="inline-flex h-11 w-full items-center justify-center rounded-md bg-primary px-8 font-medium text-primary-foreground text-sm shadow-sm transition hover:bg-primary/90 sm:w-auto"
            >
              Explore Topics
              <ArrowRight className="ml-2 h-4 w-4" />
            </a>
            <a
              href="mailto:contact@tuturuuu.com"
              className="inline-flex h-11 w-full items-center justify-center rounded-md border border-input bg-background px-8 font-medium text-sm shadow-xs transition hover:bg-accent hover:text-accent-foreground sm:w-auto"
            >
              <Mail className="mr-2 h-4 w-4" />
              Submit a Story
            </a>
          </div>
          <div className="relative mx-auto max-w-2xl">
            <Search className="absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              placeholder="Search articles, topics, and insights..."
              className="h-14 w-full rounded-2xl border border-border/50 bg-background/80 pr-4 pl-12 shadow-lg backdrop-blur-sm transition-all focus:border-dynamic-purple/50 focus:outline-none focus:ring-2 focus:ring-dynamic-purple/20"
            />
          </div>
        </div>
      </section>

      <section className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-12 text-center">
            <h2 className="mb-4 font-bold text-3xl tracking-tight sm:text-4xl">
              Explore Categories
            </h2>
            <p className="mx-auto max-w-2xl text-foreground/70 text-lg">
              Discover insights across technology, productivity, and innovation
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {categories.map((category) => (
              <div
                key={category.name}
                className="group rounded-xl border border-border/50 bg-card/80 p-6 shadow-sm backdrop-blur-sm transition-all hover:-translate-y-1 hover:shadow-xl"
              >
                <div
                  className={`mb-4 inline-flex rounded-2xl border p-3 ${category.tone}`}
                >
                  <category.icon className="h-6 w-6" />
                </div>
                <h3 className="mb-2 font-semibold text-xl">{category.name}</h3>
                <p className="text-muted-foreground">{category.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="upcoming" className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-12 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="mb-4 font-bold text-3xl tracking-tight sm:text-4xl">
                Coming Soon
              </h2>
              <p className="max-w-2xl text-foreground/70 text-lg">
                We are preparing long-form essays on the ideas shaping Tuturuuu.
              </p>
            </div>
            <Rocket className="hidden h-12 w-12 text-dynamic-orange md:block" />
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            {upcomingTopics.map((topic) => (
              <article
                key={topic.title}
                className="rounded-xl border border-border/50 bg-card/80 p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
              >
                <div className="mb-4 flex items-center justify-between gap-3">
                  <span
                    className={`inline-flex items-center rounded-full px-3 py-1 font-medium text-xs ${topic.tone}`}
                  >
                    <topic.icon className="mr-1.5 h-3.5 w-3.5" />
                    {topic.category}
                  </span>
                  <span className="text-muted-foreground text-sm">
                    {topic.readTime}
                  </span>
                </div>
                <h3 className="mb-3 font-semibold text-xl leading-tight">
                  {topic.title}
                </h3>
                <div className="flex items-center gap-2 text-dynamic-blue text-sm">
                  <Users className="h-4 w-4" />
                  Editorial queue
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl rounded-3xl border border-dynamic-blue/20 bg-linear-to-br from-dynamic-blue/10 via-background to-dynamic-cyan/10 p-8 text-center shadow-xl md:p-12">
          <TrendingUp className="mx-auto mb-6 h-12 w-12 text-dynamic-blue" />
          <h2 className="mb-4 font-bold text-3xl tracking-tight">
            Building in Public
          </h2>
          <p className="mx-auto mb-8 max-w-2xl text-foreground/70 text-lg">
            Follow our journey as we create tools for focused work, AI-powered
            collaboration, and open-source product development.
          </p>
          <a
            href="https://github.com/tutur3u/tuturuuu"
            className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-8 font-medium text-primary-foreground text-sm shadow-sm transition hover:bg-primary/90"
          >
            Visit GitHub
            <ArrowRight className="ml-2 h-4 w-4" />
          </a>
        </div>
      </section>
    </main>
  );
}
