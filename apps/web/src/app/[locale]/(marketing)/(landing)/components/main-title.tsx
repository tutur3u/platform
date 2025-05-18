import { Floating3DLogo } from './floating-3d-logo';
import { Button } from '@tuturuuu/ui/button';
import {
  Calendar,
  Check,
  Mail,
  MessageSquare,
  Package,
  Video,
} from '@tuturuuu/ui/icons';

export function MainTitle() {
  return (
    <div className="w-full text-center lg:w-1/2 lg:text-left">
      <h1 className="hero-text mb-6 text-4xl font-bold md:text-5xl lg:text-6xl">
        <Floating3DLogo />
        <span className="block">Your Complete</span>
        <span className="block bg-gradient-to-br from-dynamic-light-orange via-dynamic-light-blue to-dynamic-light-pink bg-clip-text py-1 text-transparent">
          Productivity Suite
        </span>
      </h1>
      <p className="hero-text mb-8 text-lg text-muted-foreground md:text-xl">
        Tuturuuu unifies your calendar, tasks, meetings, chat, and email in one
        intelligent workspace powered by AI.
      </p>
      <div className="flex flex-col justify-center gap-4 sm:flex-row lg:justify-start">
        <Button
          size="lg"
          className="hero-button bg-gradient-to-r from-dynamic-light-blue/80 to-dynamic-light-pink/80 text-white transition-colors hover:from-dynamic-light-blue/90 hover:to-dynamic-light-pink/90"
        >
          Get Early Access
        </Button>
        {/* <Button
          variant="outline"
          size="lg"
          className="hero-button flex items-center gap-2 border-purple-600 text-purple-600"
        >
          Watch Demo <ArrowRight size={16} />
        </Button> */}
      </div>

      <div className="mt-10 grid grid-cols-3 items-center justify-center gap-4 lg:justify-start">
        <div className="hero-badge flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-dynamic-light-purple to-[purple] shadow-md">
            <Calendar className="h-5 w-5 text-white" />
          </div>
          <span className="text-sm font-medium">TuPlan</span>
        </div>
        <div className="hero-badge flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-dynamic-light-blue to-[blue] shadow-md">
            <Check className="h-5 w-5 text-white" />
          </div>
          <span className="text-sm font-medium">TuDo</span>
        </div>
        <div className="hero-badge flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-dynamic-light-green to-[green] shadow-md">
            <Video className="h-5 w-5 text-white" />
          </div>
          <span className="text-sm font-medium">TuMeet</span>
        </div>
        <div className="hero-badge flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-dynamic-light-orange to-[orange] shadow-md">
            <MessageSquare className="h-5 w-5 text-white" />
          </div>
          <span className="text-sm font-medium">TuChat</span>
        </div>
        <div className="hero-badge flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-dynamic-light-red to-[red] shadow-md">
            <Mail className="h-5 w-5 text-white" />
          </div>
          <span className="text-sm font-medium">TuMail</span>
        </div>
        <div className="hero-badge flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-dynamic-light-indigo to-[indigo] shadow-md">
            <Package className="h-5 w-5 text-white" />
          </div>
          <span className="text-sm font-medium">TuDrive</span>
        </div>
      </div>
    </div>
  );
}
