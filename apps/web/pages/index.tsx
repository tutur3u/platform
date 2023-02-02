import { ReactElement } from "react";
import DefaultHead from "../components/headers/DefaultHead";
import Layout from "../components/layouts";
import { PageWithLayoutProps } from "../types/PageWithLayoutProps";
import { Divider } from "@mantine/core";

const HomePage: PageWithLayoutProps = () => {
  return (
    <>
      <DefaultHead />

      <div className="mt-24 mb-8 mx-4 md:mx-32 lg:mx-64">
        <section className="grid xl:grid-cols-2 gap-8">
          <div>
            <h1 className="text-xl xl:text-3xl font-semibold text-zinc-200">
              Productivity at its best,
              <span className="block py-3 text-5xl xl:text-6xl w-fit font-bold bg-gradient-to-br from-yellow-200 via-green-200 to-green-300 bg-clip-text text-transparent">
                Simplified.
              </span>
            </h1>

            <p className="mt-8 md:mt-4 text-xl text-zinc-100/80">
              We understand that managing your{" "}
              <span className="underline underline-offset-4 text-blue-300 font-semibold decoration-blue-400">
                tasks
              </span>
              ,{" "}
              <span className="underline underline-offset-4 text-orange-300 font-semibold decoration-orange-400">
                schedules
              </span>
              ,{" "}
              <span className="underline underline-offset-4 text-green-300 font-semibold decoration-green-400">
                finances
              </span>
              , and{" "}
              <span className="underline underline-offset-4 text-red-300 font-semibold decoration-red-400">
                notes
              </span>{" "}
              can be overwhelming. That&apos;s why we&apos;ve created a platform
              that takes care of everything for you and your team.
            </p>
          </div>

          <div className="h-32 md:h-96 relative group">
            <div className="absolute -inset-1 bg-gradient-to-br from-indigo-200/20 via-red-200/20 to-yellow-100/20 rounded-xl blur-lg opacity-75 group-hover:opacity-100 transition duration-1000 animate-tilt"></div>
            <div className="h-32 md:h-96 cursor-default relative rounded-xl w-full bg-gradient-to-br from-indigo-200/20 via-red-200/20 to-yellow-100/20 flex justify-center items-center">
              <div className="font-semibold text-4xl xl:text-6xl text-center bg-gradient-to-br from-indigo-200 via-red-200 to-yellow-100 text-transparent bg-clip-text py-3">
                Coming soon
              </div>
            </div>
          </div>
        </section>

        <section className="mt-8 xl:mt-24">
          <div className="text-xl xl:text-4xl text-zinc-300 font-semibold">
            Take a look at what we have to offer
          </div>

          <div className="mt-8 grid xl:grid-cols-2 gap-4 lg:gap-8">
            <div className="p-4 rounded-lg bg-blue-300/10">
              <h2 className="text-lg md:text-2xl font-semibold text-center text-blue-300">
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

            <div className="p-4 rounded-lg bg-orange-300/10">
              <h2 className="text-lg md:text-2xl font-semibold text-center text-orange-300">
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

            <div className="p-4 rounded-lg bg-green-300/10">
              <h2 className="text-lg md:text-2xl font-semibold text-center text-green-300">
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

            <div className="p-4 rounded-lg bg-red-300/10">
              <h2 className="text-lg md:text-2xl font-semibold text-center text-red-300">
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

HomePage.getLayout = function getLayout(page: ReactElement) {
  return <Layout>{page}</Layout>;
};

export default HomePage;
