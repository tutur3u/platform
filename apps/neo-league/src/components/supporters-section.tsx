import Image from 'next/image';

export function SupportersSection() {
  return (
    <section id="supporters" className="px-6 py-20 md:px-8 md:py-24">
      <div className="mx-auto max-w-6xl">
        <div className="mb-16 text-center">
          <h2 className="mb-4 font-black text-3xl shadow-text md:text-4xl">
            OUR <span className="text-secondary">SUPPORTERS</span>
          </h2>
          <p className="mx-auto max-w-2xl font-bold text-foreground text-lg">
            Proudly supported by leading institutions committed to fostering
            innovation and student excellence.
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-3">
          {/* RMIT SSET */}
          <div className="glass-card card-hover group relative overflow-hidden rounded-2xl p-8">
            <div className="absolute inset-0 bg-linear-to-br from-primary/5 to-secondary/5 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
            <div className="relative z-10 flex flex-col items-center text-center">
              <div className="mb-6 flex h-32 w-full items-center justify-center rounded-xl bg-white p-4 shadow-sm transition-transform duration-300 group-hover:scale-105">
                <Image
                  width={200}
                  height={100}
                  src="/rmit_sset.png"
                  alt="RMIT School of Science, Engineering & Technology"
                  className="w-auto object-contain"
                />
              </div>
              <h3 className="mb-2 font-black text-lg">
                RMIT School of Science,
                <br />
                Engineering & Technology
              </h3>
              <p className="text-foreground text-sm">Academic Partner</p>
            </div>
          </div>

          {/* NCT */}
          <div className="glass-card card-hover group relative overflow-hidden rounded-2xl p-8">
            <div className="absolute inset-0 bg-linear-to-br from-primary/5 to-secondary/5 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
            <div className="relative z-10 flex flex-col items-center text-center">
              <div className="mb-6 flex h-32 w-full items-center justify-center rounded-xl bg-white p-4 shadow-sm transition-transform duration-300 group-hover:scale-105">
                <Image
                  width={200}
                  height={100}
                  src="/rmit_nct.png"
                  alt="NEO Culture Technology Club"
                  className="w-auto object-contain"
                />
              </div>
              <h3 className="mb-2 font-black text-lg">
                NEO Culture Technology
                <br />
                Club
              </h3>
              <p className="text-foreground text-sm">Organizer</p>
            </div>
          </div>

          {/* RMIT Student Club Program */}
          <div className="glass-card card-hover group relative overflow-hidden rounded-2xl p-8">
            <div className="absolute inset-0 bg-linear-to-br from-primary/5 to-secondary/5 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
            <div className="relative z-10 flex flex-col items-center text-center">
              <div className="mb-6 flex h-32 w-full items-center justify-center rounded-xl bg-white p-4 shadow-sm transition-transform duration-300 group-hover:scale-105">
                <Image
                  width={200}
                  height={100}
                  src="/rmit_student_club_program.png"
                  alt="RMIT Student Club Program"
                  className="w-auto object-contain"
                />
              </div>
              <h3 className="mb-2 font-black text-lg">
                RMIT Student Club
                <br />
                Program
              </h3>
              <p className="text-foreground text-sm">Institutional Support</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
