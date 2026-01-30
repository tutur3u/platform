export function AboutSection() {
  const stats = [
    { number: '80+', label: 'Club Members' },
    { number: '30+', label: 'Completed Projects' },
    { number: '20', label: 'Teams Advancing' },
    { number: '5', label: 'Finalists' },
  ];

  return (
    <section
      id="about"
      className="bg-secondary/10 px-6 py-20 md:px-8 md:py-24 dark:bg-secondary/5"
    >
      <div className="mx-auto max-w-6xl">
        <div className="mb-16 text-center">
          <h2 className="mb-4 font-black text-3xl shadow-text md:text-5xl">
            ABOUT <span className="text-secondary">NEO LEAGUE</span>
          </h2>
          <p className="mx-auto max-w-2xl font-bold text-foreground text-lg">
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
            <p className="text-foreground">
              Combine physical prototyping with software, data connectivity, and
              smart technologies to address UN Sustainable Development Goals
              (SDGs). Focus on real hardware solutions, not just ideation.
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
            <p className="text-foreground">
              RMIT NEO Culture Technology Club focuses on innovation in emerging
              technologies like machine learning and digital systems. With 80+
              members and 30+ completed projects, we foster a community of tech
              enthusiasts.
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
          {stats.map((stat, index) => (
            <div
              key={index}
              className="glass-card card-hover rounded-xl p-6 text-center"
            >
              <p className="gradient-text mb-2 font-black text-3xl shadow-text md:text-4xl">
                {stat.number}
              </p>
              <p className="text-foreground text-sm">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
