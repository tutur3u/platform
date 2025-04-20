import { Button } from '@tuturuuu/ui/button';
import { ArrowUp } from '@tuturuuu/ui/icons';

interface Props {
  elementId: string;
  prevScrollPos: number;
}

const ScrollToTopButton = ({ elementId, prevScrollPos }: Props) => {
  return (
    <Button
      className={`fixed bottom-16 right-4 z-50 rounded-full border border-blue-300/50 bg-[#f4f9ff] md:bottom-4 md:right-8 dark:border-blue-300/20 dark:bg-[#2b3542] ${
        prevScrollPos <= 100 ? 'hidden' : ''
      }`}
      onClick={() => {
        document?.getElementById(elementId)?.scrollTo(0, 0);
      }}
    >
      <ArrowUp className="h-6 w-6" />
    </Button>
  );
};

export default ScrollToTopButton;
