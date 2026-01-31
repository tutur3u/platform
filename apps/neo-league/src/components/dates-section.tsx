export function DatesSection() {
  const importantDates = [
    {
      round: '01',
      date: 'March 28',
      event: 'OPENING CEREMONY',
      type: 'Virtual',
      description: 'Kickoff event introducing the competition and guidelines',
    },
    {
      round: '02',
      date: 'April 24',
      event: 'TOP 20 SELECTION',
      type: 'Virtual',
      description: 'Announcement of top 20 teams advancing to prototype phase',
    },
    {
      round: '03',
      date: 'May 16',
      event: 'TOP 5 SELECTION',
      type: 'Virtual',
      description: 'Announcement of top 5 finalists for the grand finale',
    },
    {
      round: '04',
      date: 'May 29',
      event: 'FINALE - EXHIBITION',
      type: 'RMIT Auditorium',
      description: 'Live pitch, product demonstration, and award ceremony',
    },
  ];

  return (
    <section
      id="dates"
      className="bg-secondary/10 px-6 py-20 md:px-8 md:py-24 dark:bg-secondary/5"
    >
      <div className="mx-auto max-w-4xl">
        <div className="mb-16 text-center">
          <h2 className="mb-4 font-black text-3xl shadow-text md:text-4xl">
            IMPORTANT <span className="text-secondary">DATES</span>
          </h2>
        </div>

        {/* Vertical Timeline */}
        <div className="relative">
          {/* Vertical Line */}
          <div className="absolute top-0 bottom-0 left-6 w-0.5 bg-linear-to-b from-primary via-secondary to-primary md:left-1/2 md:-translate-x-1/2" />

          <div className="space-y-12">
            {importantDates.map((item, index) => (
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
                    <p className="text-foreground text-sm">
                      {item.description}
                    </p>
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
  );
}
