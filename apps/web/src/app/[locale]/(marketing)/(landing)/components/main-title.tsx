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
import { useTranslations } from 'next-intl';

export function MainTitle() {
  const t = useTranslations('landing');

  return (
    <div className="w-full text-center lg:w-1/2 lg:text-left">
      <h1 className="hero-text mb-6 flex flex-col items-center justify-center text-4xl font-bold md:text-5xl lg:text-6xl">
        <Floating3DLogo />
        <span className="leading-18">
          {t('title_p1')}{' '}
          <span className="from-dynamic-light-orange via-dynamic-light-blue to-dynamic-light-pink bg-gradient-to-br bg-clip-text text-transparent">
            {t('title_p2')}
          </span>
        </span>
      </h1>
      <p className="hero-text text-muted-foreground mb-8 text-lg md:text-xl">
        {t('description')}
      </p>
      <div className="flex flex-col justify-center gap-4 sm:flex-row lg:justify-start">
        <Button
          size="lg"
          className="hero-button from-dynamic-light-blue/80 to-dynamic-light-pink/80 hover:from-dynamic-light-blue/90 hover:to-dynamic-light-pink/90 bg-gradient-to-r text-white transition-colors"
        >
          {t('cta')}
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
          <div className="from-dynamic-light-purple flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br to-[purple] shadow-md">
            <Calendar className="h-5 w-5 text-white" />
          </div>
          <span className="text-sm font-medium">TuPlan</span>
        </div>
        <div className="hero-badge flex items-center gap-2">
          <div className="from-dynamic-light-blue flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br to-[blue] shadow-md">
            <Check className="h-5 w-5 text-white" />
          </div>
          <span className="text-sm font-medium">TuDo</span>
        </div>
        <div className="hero-badge flex items-center gap-2">
          <div className="from-dynamic-light-green flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br to-[green] shadow-md">
            <Video className="h-5 w-5 text-white" />
          </div>
          <span className="text-sm font-medium">TuMeet</span>
        </div>
        <div className="hero-badge flex items-center gap-2">
          <div className="from-dynamic-light-orange flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br to-[orange] shadow-md">
            <MessageSquare className="h-5 w-5 text-white" />
          </div>
          <span className="text-sm font-medium">TuChat</span>
        </div>
        <div className="hero-badge flex items-center gap-2">
          <div className="from-dynamic-light-red flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br to-[red] shadow-md">
            <Mail className="h-5 w-5 text-white" />
          </div>
          <span className="text-sm font-medium">TuMail</span>
        </div>
        <div className="hero-badge flex items-center gap-2">
          <div className="from-dynamic-light-indigo flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br to-[indigo] shadow-md">
            <Package className="h-5 w-5 text-white" />
          </div>
          <span className="text-sm font-medium">TuDrive</span>
        </div>
      </div>
    </div>
  );
}
