export default function RulesSection() {
  return (
    <section id="rules" className="px-6 py-20 md:px-8 md:py-24">
      <div className="mx-auto max-w-6xl">
        <div className="mb-16 text-center">
          <h2 className="mb-4 text-3xl md:text-4xl tracking-wide">
            <span className="font-medium text-[#134e4a] italic">
              ELIGIBILITY &{' '}
            </span>
            <span className="relative inline-block font-black text-[#134e4a]">
              RULES
              <span className="absolute left-0 -bottom-1 h-[4px] w-full bg-yellow-400"></span>
            </span>
          </h2>
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
  );
}
