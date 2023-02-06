import { Divider } from '@mantine/core';
import DefaultHead from '../headers/DefaultHead';

const LandingPage = () => {
  return (
    <>
      <DefaultHead />
      <div className="mx-4 mt-24 mb-8 md:mx-32 lg:mx-64">
        <section className="grid gap-8 xl:grid-cols-2">
          <div>
            <h1 className="text-xl font-semibold text-zinc-200 xl:text-3xl">
              Productivity at its best,
              <span className="block w-fit bg-gradient-to-br from-yellow-200 via-green-200 to-green-300 bg-clip-text py-3 text-5xl font-bold text-transparent xl:text-6xl">
                Simplified.
              </span>
            </h1>

            <p className="mt-8 text-xl text-zinc-100/80 md:mt-4">
              We understand that managing your{' '}
              <span className="font-semibold text-blue-300 underline decoration-blue-400 underline-offset-4">
                tasks
              </span>
              ,{' '}
              <span className="font-semibold text-orange-300 underline decoration-orange-400 underline-offset-4">
                schedules
              </span>
              ,{' '}
              <span className="font-semibold text-green-300 underline decoration-green-400 underline-offset-4">
                finances
              </span>
              , and{' '}
              <span className="font-semibold text-red-300 underline decoration-red-400 underline-offset-4">
                notes
              </span>{' '}
              can be overwhelming. That&apos;s why we&apos;ve created a platform
              that takes care of everything for you and your team.
            </p>
          </div>

          <div className="group relative h-32 md:h-96">
            <div className="animate-tilt absolute -inset-1 rounded-xl bg-gradient-to-br from-indigo-200/20 via-red-200/20 to-yellow-100/20 opacity-75 blur-lg transition duration-1000 group-hover:opacity-100"></div>
            <div className="relative flex h-32 w-full cursor-default items-center justify-center rounded-xl bg-gradient-to-br from-indigo-200/20 via-red-200/20 to-yellow-100/20 md:h-96">
              <div className="bg-gradient-to-br from-indigo-200 via-red-200 to-yellow-100 bg-clip-text py-3 text-center text-4xl font-semibold text-transparent xl:text-6xl">
                Coming soon
              </div>
            </div>
          </div>
        </section>

        <section className="mt-8 xl:mt-24">
          <div className="text-xl font-semibold text-zinc-300 xl:text-4xl">
            Take a look at what we have to offer
          </div>

          <div className="mt-8 grid gap-4 lg:gap-8 xl:grid-cols-2">
            <div className="rounded-lg bg-blue-300/10 p-4">
              <h2 className="text-center text-lg font-semibold text-blue-300 md:text-2xl">
                Task Management
              </h2>

              <Divider
                className="mt-2 mb-4 border-blue-300/20"
                variant="dashed"
              />

              <p className="text-blue-300/80">
                Keep your tasks organized and your team on the same page with
                our board, list, and role system. Visualize your tasks and their
                progress with ease, and assign tasks to team members with just a
                few clicks.
              </p>
            </div>

            <div className="rounded-lg bg-orange-300/10 p-4">
              <h2 className="text-center text-lg font-semibold text-orange-300 md:text-2xl">
                Auto-Scheduling Calendar Manager
              </h2>

              <Divider
                className="mt-2 mb-4 border-orange-300/20"
                variant="dashed"
              />

              <p className="text-orange-300/80">
                Say goodbye to scheduling conflicts and hello to a perfectly
                organized week with our intelligent algorithm. Our calendar
                manager uses a sophisticated algorithm to intelligently schedule
                your week based on your tasks, appointments, and availability.
              </p>
            </div>

            <div className="rounded-lg bg-green-300/10 p-4">
              <h2 className="text-center text-lg font-semibold text-green-300 md:text-2xl">
                Notion-like Note Taking
              </h2>

              <Divider
                className="mt-2 mb-4 border-green-300/20"
                variant="dashed"
              />

              <p className="text-green-300/80">
                Store all your notes, ideas, and information in one place for
                easy access and organization. Our note-taking experience is
                designed to be flexible and intuitive, so you can focus on your
                thoughts and ideas, not on the tool itself.
              </p>
            </div>

            <div className="rounded-lg bg-red-300/10 p-4">
              <h2 className="text-center text-lg font-semibold text-red-300 md:text-2xl">
                Personal & Team Finance Tracker
              </h2>

              <Divider
                className="mt-2 mb-4 border-red-300/20"
                variant="dashed"
              />

              <p className="text-red-300/80">
                Keep track of your finances and budget like a pro, with our
                user-friendly finance tracker. Our platform makes it easy to see
                where your money is going, so you can make informed decisions
                about your financial future. With our platform, you&apos;ll have
                everything you need to streamline your tasks, manage your
                schedules, and keep track of your finances, all in one place.
              </p>
            </div>
          </div>
        </section>
      </div>
    </>
  );
};

export default LandingPage;
