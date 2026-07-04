import { Sparkles } from '@tuturuuu/icons/lucide';
import { GradientHeadline } from '@tuturuuu/ui/custom/gradient-headline';
import type { AppMessages } from '../../lib/platform/messages';

type WorkspacePlaceholderPageProps = {
  messages: Pick<AppMessages, 'common'>;
};

export function WorkspacePlaceholderPage({
  messages,
}: WorkspacePlaceholderPageProps) {
  return (
    <div className="flex min-h-screen w-full items-center justify-center gap-3 font-bold text-2xl lg:text-4xl xl:text-5xl">
      <GradientHeadline>{messages.common.coming_soon}</GradientHeadline>
      <Sparkles aria-hidden="true" className="h-8 w-8 text-dynamic-purple" />
    </div>
  );
}
