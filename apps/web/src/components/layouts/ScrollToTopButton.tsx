import { Button } from '@ncthub/ui/button';
import { ArrowUp } from '@ncthub/ui/icons';

interface Props {
  elementId: string;
  prevScrollPos: number;
}

const ScrollToTopButton = ({ elementId, prevScrollPos }: Props) => {
  return (
    <Button
      className={`fixed right-4 bottom-16 z-50 rounded-full border border-blue-300/50 bg-[#f4f9ff] md:right-8 md:bottom-4 dark:border-blue-300/20 dark:bg-[#2b3542] ${
        prevScrollPos <= 100 ? 'hidden' : ''
      }`}
      size="lg"
      variant="outline"
      onClick={() => {
        document?.getElementById(elementId)?.scrollTo(0, 0);
      }}
    >
      <ArrowUp className="h-6 w-6" />
    </Button>
  );
};

export default ScrollToTopButton;
