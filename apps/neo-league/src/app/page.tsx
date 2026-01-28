export default function Home() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Hero Section */}
      <section className="relative flex min-h-screen items-center justify-center overflow-hidden">
        {/* Background Gradient */}
        <div className="gradient-bg absolute inset-0 opacity-10 dark:opacity-20" />

        {/* Animated Blobs */}
        <div className="blob -top-48 -left-48 h-96 w-96 animate-float bg-primary" />
        <div
          className="blob top-1/2 -right-40 h-80 w-80 animate-float bg-secondary"
          style={{ animationDelay: '2s' }}
        />
        <div
          className="blob bottom-20 left-1/4 h-64 w-64 animate-float bg-primary"
          style={{ animationDelay: '4s' }}
        />

        <div className="relative z-10 mx-auto max-w-6xl px-6 text-center">
          <div className="animate-slide-up">
            <span className="mb-6 inline-block rounded-full bg-secondary/30 px-4 py-2 font-bold text-foreground text-sm dark:bg-secondary/20">
              RMIT NEO Culture Technology Club Presents
            </span>
          </div>

          <h1
            className="mb-6 animate-slide-up font-extrabold text-4xl md:text-6xl lg:text-7xl"
            style={{ animationDelay: '0.1s' }}
          >
            <span className="gradient-text drop-shadow-text">NEO LEAGUE</span>
            <br />
            <span className="text-muted">SEASON 2</span>
          </h1>

          <p
            className="mb-4 animate-slide-up font-black text-primary text-xl md:text-2xl"
            style={{ animationDelay: '0.2s' }}
          >
            INNOVATION HUMANITY CHALLENGE
          </p>

          <p
            className="mx-auto mb-8 max-w-2xl animate-slide-up text-foreground/70 text-lg"
            style={{ animationDelay: '0.3s' }}
          >
            Engineer integrated IoT solutions addressing UN Sustainable
            Development Goals. Combine physical prototyping with software, data
            connectivity, and smart technologies.
          </p>

          <div
            className="mb-12 flex animate-slide-up flex-col justify-center gap-4 sm:flex-row"
            style={{ animationDelay: '0.4s' }}
          >
            <a href="#register" className="btn-primary animate-pulse-glow">
              Register Now
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </a>
            <a href="#about" className="btn-secondary">
              Learn More
            </a>
          </div>

          <div
            className="glass inline-block animate-slide-up rounded-2xl px-8 py-4"
            style={{ animationDelay: '0.5s' }}
          >
            <p className="font-bold text-lg">
              <span className="text-primary">📅</span> March 2 – May 29, 2026
              <span className="mx-4 text-muted">|</span>
              <span className="text-primary">📍</span> Ho Chi Minh City
            </p>
          </div>
        </div>

        {/* Scroll Indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
          <svg
            className="h-6 w-6 text-primary"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 14l-7 7m0 0l-7-7m7 7V3"
            />
          </svg>
        </div>
      </section>

      {/* About Section */}
      <section
        id="about"
        className="bg-secondary/10 px-6 py-20 md:px-8 md:py-24 dark:bg-secondary/5"
      >
        <div className="mx-auto max-w-6xl">
          <div className="mb-16 text-center">
            <h2 className="mb-4 font-black text-3xl drop-shadow-text md:text-4xl">
              ABOUT <span className="text-secondary">NEO LEAGUE</span>
            </h2>
            <p className="mx-auto max-w-2xl font-bold text-muted">
              A student-led competition challenging Ho Chi Minh City
              undergraduates to engineer integrated IoT solutions.
            </p>
          </div>

          <div className="mb-16 grid gap-8 md:grid-cols-2">
            <div className="glass-card card-hover rounded-2xl p-8">
              <div className="gradient-bg mb-6 flex h-14 w-14 items-center justify-center rounded-xl">
                <svg
                  className="h-7 w-7 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                  />
                </svg>
              </div>
              <h3 className="mb-3 font-black text-xl">THE CHALLENGE</h3>
              <p className="text-muted">
                Combine physical prototyping with software, data connectivity,
                and smart technologies to address UN Sustainable Development
                Goals (SDGs). Focus on real hardware solutions, not just
                ideation.
              </p>
            </div>

            <div className="glass-card card-hover rounded-2xl p-8">
              <div className="gradient-bg mb-6 flex h-14 w-14 items-center justify-center rounded-xl">
                <svg
                  className="h-7 w-7 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                  />
                </svg>
              </div>
              <h3 className="mb-3 font-black text-xl">ABOUT THE ORGANIZERS</h3>
              <p className="text-muted">
                RMIT NEO Culture Technology Club focuses on innovation in
                emerging technologies like machine learning and digital systems.
                With 80+ members and 30+ completed projects, we foster a
                community of tech enthusiasts.
              </p>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
            {[
              { number: '80+', label: 'Club Members' },
              { number: '30+', label: 'Completed Projects' },
              { number: '20', label: 'Teams Advancing' },
              { number: '5', label: 'Finalists' },
            ].map((stat, index) => (
              <div
                key={index}
                className="glass-card card-hover rounded-xl p-6 text-center"
              >
                <p className="gradient-text mb-2 font-black text-3xl drop-shadow-text md:text-4xl">
                  {stat.number}
                </p>
                <p className="text-muted text-sm">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Competition Phases */}
      <section id="phases" className="px-6 py-20 md:px-8 md:py-24">
        <div className="mx-auto max-w-6xl">
          <div className="mb-16 text-center">
            <h2 className="mb-4 font-black text-3xl md:text-4xl">
              COMPETITION <span className="text-secondary">PHASES</span>
            </h2>
            <p className="mx-auto max-w-2xl font-bold text-muted">
              Three challenging rounds designed to test your innovation,
              technical skills, and presentation abilities.
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-3">
            {[
              {
                round: '01',
                title: 'PROPOSAL',
                description:
                  'Submit a 10-slide digital IoT solution proposal targeting specific SDGs. Present your innovative idea and technical approach.',
                icon: (
                  <svg
                    className="h-8 w-8"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                ),
              },
              {
                round: '02',
                title: 'PROTOTYPE',
                description:
                  'Top 20 teams develop a functional physical prototype, technical documentation, and a 5-minute demo video.',
                icon: (
                  <svg
                    className="h-8 w-8"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                ),
              },
              {
                round: '03',
                title: 'FINAL PITCH',
                description:
                  'Top 5 finalists perform a live pitch and product demonstration at RMIT Saigon South Campus.',
                icon: (
                  <svg
                    className="h-8 w-8"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
                    />
                  </svg>
                ),
              },
            ].map((phase, index) => (
              <div key={index} className="group relative">
                <div className="glass-card card-hover h-full rounded-2xl p-8">
                  <div className="gradient-bg absolute -top-4 -right-4 flex h-16 w-16 items-center justify-center rounded-full font-black text-white text-xl shadow-lg">
                    {phase.round}
                  </div>
                  <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-xl bg-secondary/30 text-primary dark:bg-secondary/20">
                    {phase.icon}
                  </div>
                  <h3 className="mb-4 font-black text-2xl">{phase.title}</h3>
                  <p className="text-muted">{phase.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Important Dates */}
      <section
        id="dates"
        className="bg-secondary/10 px-6 py-20 md:px-8 md:py-24 dark:bg-secondary/5"
      >
        <div className="mx-auto max-w-4xl">
          <div className="mb-16 text-center">
            <h2 className="mb-4 font-black text-3xl md:text-4xl">
              IMPORTANT <span className="text-secondary">DATES</span>
            </h2>
            <p className="font-bold text-lg text-muted">
              Mark your calendar for these key milestones in 2026.
            </p>
          </div>

          {/* Vertical Timeline */}
          <div className="relative">
            {/* Vertical Line */}
            <div className="absolute top-0 bottom-0 left-6 w-0.5 bg-linear-to-b from-primary via-secondary to-primary md:left-1/2 md:-translate-x-1/2" />

            <div className="space-y-12">
              {[
                {
                  round: '01',
                  date: 'March 28',
                  event: 'OPENING CEREMONY',
                  type: 'Virtual',
                  description:
                    'Kickoff event introducing the competition and guidelines',
                },
                {
                  round: '02',
                  date: 'April 24',
                  event: 'TOP 20 SELECTION',
                  type: 'Virtual',
                  description:
                    'Announcement of top 20 teams advancing to prototype phase',
                },
                {
                  round: '03',
                  date: 'May 16',
                  event: 'TOP 5 SELECTION',
                  type: 'Virtual',
                  description:
                    'Announcement of top 5 finalists for the grand finale',
                },
                {
                  round: '04',
                  date: 'May 29',
                  event: 'FINALE - EXHIBITION',
                  type: 'RMIT Auditorium',
                  description:
                    'Live pitch, product demonstration, and award ceremony',
                },
              ].map((item, index) => (
                <div
                  key={index}
                  className={`relative flex items-center ${
                    index % 2 === 0 ? 'md:flex-row' : 'md:flex-row-reverse'
                  }`}
                >
                  {/* Circle with Round Number */}
                  <div className="absolute left-6 z-10 flex h-12 w-12 -translate-x-1/2 items-center justify-center md:left-1/2">
                    <div className="gradient-bg flex h-12 w-12 items-center justify-center rounded-full font-black text-white shadow-lg ring-4 ring-background">
                      {item.round}
                    </div>
                  </div>

                  {/* Content Card */}
                  <div
                    className={`ml-16 w-full md:ml-0 md:w-[calc(50%-3rem)] ${
                      index % 2 === 0 ? 'md:pr-8' : 'md:pl-8'
                    }`}
                  >
                    <div className="glass-card card-hover rounded-2xl p-6">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="rounded-full bg-primary/20 px-3 py-1 font-bold text-primary text-xs">
                          {item.type}
                        </span>
                        <span className="gradient-text font-black text-lg">
                          {item.date}
                        </span>
                      </div>
                      <h3 className="mb-2 font-black text-xl">{item.event}</h3>
                      <p className="text-muted text-sm">{item.description}</p>
                    </div>
                  </div>

                  {/* Spacer for alternating layout on desktop */}
                  <div className="hidden md:block md:w-[calc(50%-3rem)]" />
                </div>
              ))}
            </div>

            {/* End circle */}
            <div className="absolute -bottom-4 left-6 flex h-8 w-8 -translate-x-1/2 items-center justify-center md:left-1/2">
              <div className="gradient-bg h-4 w-4 rounded-full shadow-lg ring-4 ring-background" />
            </div>
          </div>
        </div>
      </section>

      {/* Eligibility & Rules */}
      <section id="rules" className="px-6 py-20 md:px-8 md:py-24">
        <div className="mx-auto max-w-6xl">
          <div className="mb-16 text-center">
            <h2 className="mb-4 font-black text-3xl md:text-4xl">
              ELIGIBILITY & <span className="text-secondary">RULES</span>
            </h2>
            <p className="mx-auto max-w-2xl font-bold text-muted">
              Make sure your team meets all requirements before registering.
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-2">
            <div className="glass-card rounded-2xl p-8">
              <h3 className="mb-6 flex items-center gap-3 font-black text-2xl">
                <span className="gradient-bg flex h-10 w-10 items-center justify-center rounded-lg text-white">
                  ✓
                </span>
                ELIGIBILITY
              </h3>
              <ul className="space-y-4">
                <li className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary">
                    •
                  </span>
                  <span>
                    Undergraduates <strong>over 18 years old</strong> from any
                    university in Ho Chi Minh City
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary">
                    •
                  </span>
                  <span>
                    Team of <strong>exactly 4 members</strong> with diverse
                    backgrounds (Business, Software, Robotics, etc.)
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary">
                    •
                  </span>
                  <span>
                    Projects must be{' '}
                    <strong>functional physical prototypes</strong> — pure
                    software solutions are excluded
                  </span>
                </li>
              </ul>
            </div>

            <div className="glass-card rounded-2xl p-8">
              <h3 className="mb-6 flex items-center gap-3 font-black text-2xl">
                <span className="gradient-bg flex h-10 w-10 items-center justify-center rounded-lg text-white">
                  !
                </span>
                RULES
              </h3>
              <ul className="space-y-4">
                <li className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary">
                    1
                  </span>
                  <span>
                    <strong>ORIGINALITY:</strong> Projects must be created
                    specifically for NEO League Season 2
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary">
                    2
                  </span>
                  <span>
                    <strong>INTEGRITY:</strong> Zero tolerance for plagiarism or
                    &quot;ghost-building&quot; (using external professional
                    services)
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary">
                    3
                  </span>
                  <span>
                    <strong>FINAL DAY:</strong> Finalists must surrender
                    prototypes for morning inspection with 5-minute setup window
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Mentors & Judges */}
      <section
        id="mentors"
        className="bg-secondary/10 px-6 py-20 md:px-8 md:py-24 dark:bg-secondary/5"
      >
        <div className="mx-auto max-w-6xl">
          <div className="mb-16 text-center">
            <h2 className="mb-4 font-black text-3xl md:text-4xl">
              MENTORS & <span className="text-secondary">JUDGES</span>
            </h2>
            <p className="mx-auto max-w-2xl font-bold text-muted">
              Learn from and be evaluated by distinguished faculty from RMIT
              School of Science, Engineering & Technology.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
            {[
              {
                name: 'DR. BYRON MASON',
                field: 'Robotics & Mechatronics Engineering',
              },
              {
                name: 'DR. DINH-SON VU',
                field: 'Robotics & Mechatronics Engineering',
              },
              {
                name: 'DR. HUNG PHAM VIET',
                field: 'Electronic Computer Systems & Robotics',
              },
              { name: 'DR. GINEL DORLEON', field: 'Artificial Intelligence' },
              { name: 'DR. MINH VU', field: 'Information Technology' },
              {
                name: 'DR. THANH TRAN',
                field: 'Electronic & Computer Systems Engineering',
              },
              { name: 'DR. LINH TRAN', field: 'Software Engineering' },
              { name: 'DR. HOANG PHAN', field: 'Food Technology & Nutrition' },
            ].map((mentor, index) => (
              <div
                key={index}
                className="glass-card card-hover rounded-xl p-6 text-center"
              >
                <div className="gradient-bg mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full font-black text-2xl text-white">
                  {mentor.name.split(' ').pop()?.charAt(0)}
                </div>
                <h4 className="mb-1 font-black">{mentor.name}</h4>
                <p className="text-muted text-sm">{mentor.field}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section id="contact" className="px-6 py-20 md:px-8 md:py-24">
        <div className="mx-auto max-w-4xl">
          <div className="glass-card relative overflow-hidden rounded-3xl p-8 text-center md:p-12">
            {/* Background decoration */}
            <div className="gradient-bg absolute inset-0 opacity-5" />
            <div className="blob -top-40 -right-40 h-64 w-64 bg-primary" />
            <div className="blob -bottom-24 -left-24 h-48 w-48 bg-secondary" />

            <div className="relative z-10">
              <h2 className="mb-4 font-black text-3xl md:text-4xl">
                READY TO <span className="gradient-text">INNOVATE?</span>
              </h2>
              <p className="mx-auto mb-8 max-w-xl text-muted">
                Join the NEO League Season 2 and showcase your IoT innovation
                skills. Registration is now open!
              </p>

              <a
                href="#register"
                className="btn-primary mb-12 inline-flex animate-pulse-glow px-8 py-4 font-black text-lg uppercase"
              >
                Register Your Team
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-6 w-6"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
              </a>

              <div className="mt-8 border-primary/20 border-t pt-8">
                <h3 className="mb-6 font-black">CONTACT US</h3>
                <div className="grid gap-6 md:grid-cols-3">
                  <div>
                    <p className="mb-1 text-md text-muted">Phone</p>
                    <p className="font-bold text-sm">0765386296 (Ms. Tam)</p>
                    <p className="font-bold text-sm">0918498056 (Mr. Tai)</p>
                  </div>
                  <div>
                    <p className="mb-1 text-md text-muted">Email</p>
                    <a
                      href="mailto:neoculturetechclub.sgs@rmit.edu.vn"
                      className="font-bold text-primary text-sm hover:underline"
                    >
                      neoculturetechclub.sgs@rmit.edu.vn
                    </a>
                  </div>
                  <div>
                    <p className="mb-1 text-md text-muted">Follow Us</p>
                    <div className="flex flex-col justify-center">
                      <a
                        href="https://rmitnct.club"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary transition-colors hover:text-primary-foreground"
                      >
                        🌐 rmitnct.club
                      </a>
                      <a
                        href="https://facebook.com/RMITNeoCultureTech"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary transition-colors hover:text-primary-foreground"
                      >
                        📘 Facebook
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-primary/10 border-t py-8">
        <div className="mx-auto max-w-6xl px-6 text-center">
          <p className="text-primary text-sm">
            © 2026 RMIT NEO Culture Technology Club. All rights reserved.
          </p>
          <p className="mt-2 text-primary text-xs">
            Core Values: Culture • Revolutionary • Companionship • Diversity •
            Inclusion
          </p>
        </div>
      </footer>
    </div>
  );
}
