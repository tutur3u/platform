import {
  PencilIcon,
  CodeBracketIcon,
  ChatBubbleLeftEllipsisIcon,
  CheckCircleIcon,
  BanknotesIcon,
  SparklesIcon,
} from "@heroicons/react/20/solid";
import Link from "next/link";

export const dynamic = "force-dynamic";

const resources = [
  {
    title: "Fully-featured chat",
    subtitle:
      "We have a fully-featured chatting experience, with support for markdown, code blocks, and more.",
    icon: <ChatBubbleLeftEllipsisIcon className="h-6 w-6" />,
  },
  {
    title: "Powerful task management",
    subtitle:
      "We have a powerful task management system, with support for subtasks, due dates, and more.",
    icon: <CheckCircleIcon className="h-6 w-6" />,
    comingSoon: true,
  },
  {
    title: "Intuitive note-taking",
    subtitle:
      "We have an intuitive note-taking experience, with support for rich text, code blocks, and more.",
    icon: <PencilIcon className="h-6 w-6" />,
    comingSoon: true,
  },
  {
    title: "Robust finance tracker",
    subtitle:
      "We have a robust finance tracker, with support for recurring transactions, budgets, and more.",
    icon: <BanknotesIcon className="h-6 w-6" />,
    comingSoon: true,
  },
  {
    title: "Powered by AI",
    subtitle:
      "We use AI to help you brainstorm and organize your ideas at the speed of thought.",
    icon: <SparklesIcon className="h-6 w-6" />,
  },
  {
    title: "Flexible and customizable",
    subtitle:
      "We are open-source, so you can contribute to our codebase and help us make Rewise better for everyone.",
    url: "https://github.com/tutur3u/rewise",
    icon: <CodeBracketIcon className="h-6 w-6" />,
  },
];

export default async function MarketingPage() {
  return (
    <div className="w-full flex flex-col items-center">
      <div className="animate-in flex flex-col gap-6 lg:gap-14 opacity-0 max-w-4xl px-3 py-16 mt-24 lg:py-24 text-foreground">
        <div className="flex flex-col items-center mb-4 lg:mb-12">
          <h1 className="text-center relative mb-8 text-4xl lg:text-7xl font-bold">
            Tuturuuu
          </h1>

          <p className="text-lg md:text-2xl lg:text-3xl !leading-tight mx-auto max-w-xl text-center my-4 md:mb-8">
          Take control of your workflow,{' '}
            <span className="bg-gradient-to-r font-semibold bg-clip-text text-transparent from-pink-300 via-amber-300 to-blue-300">
              supercharged by AI
            </span>
            .
          </p>

          <div className="relative inline-flex group">
            <div className="absolute transition-all opacity-70 -inset-px bg-gradient-to-r from-rose-400/60 to-orange-300/60 rounded-lg blur-lg group-hover:opacity-100 group-hover:-inset-1 group-hover:duration-200 animate-tilt"></div>
            <Link
              href="/login"
              className="relative inline-flex items-center justify-center px-8 py-2 md:text-lg font-bold text-white transition-all bg-gradient-to-r from-rose-400/60 to-orange-300/60 rounded-lg"
            >
              Get started
            </Link>
          </div>
        </div>

        <div className="w-full p-[1px] bg-gradient-to-r from-transparent via-foreground/10 to-transparent" />

        <div className="flex flex-col gap-8 text-foreground">
          <h2 className="md:text-lg font-bold text-center">
            What can you do with Rewise?
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {resources
              .sort((a, b) => (a.comingSoon ? 1 : 0) - (b.comingSoon ? 1 : 0))
              .map(({ title, subtitle, url, icon, comingSoon }) =>
                url ? (
                  <Link
                    href={url}
                    key={title}
                    className={`relative flex flex-col border-foreground/30 group rounded-lg border p-6 ${
                      comingSoon
                        ? "opacity-50 cursor-default"
                        : "hover:border-foreground"
                    }`}
                  >
                    <h3 className="font-bold min-h-[40px]">{title}</h3>
                    <div className="flex flex-col grow gap-4 justify-between">
                      <p className="text-sm opacity-70">{subtitle}</p>
                      <div className="opacity-60 group-hover:opacity-100">
                        {icon}
                      </div>
                    </div>
                  </Link>
                ) : (
                  <div
                    key={title}
                    className={`relative border-foreground/30 flex flex-col group rounded-lg border p-6 ${
                      comingSoon
                        ? "opacity-30 cursor-default"
                        : "hover:border-foreground"
                    }`}
                  >
                    <h3 className="font-bold min-h-[40px]">{title}</h3>
                    <div className="flex flex-col grow gap-4 justify-between">
                      <p className="text-sm opacity-70">{subtitle}</p>
                      <div
                        className={`opacity-60 ${
                          comingSoon || "group-hover:opacity-100"
                        }`}
                      >
                        {icon}
                      </div>
                    </div>
                    {comingSoon && (
                      <div className="absolute px-2 py-0.5 font-semibold rounded bg-foreground/20 text-sm text-foreground bottom-4 right-4">
                        Coming soon
                      </div>
                    )}
                  </div>
                )
              )}
          </div>
        </div>
      </div>
    </div>
  );
}
