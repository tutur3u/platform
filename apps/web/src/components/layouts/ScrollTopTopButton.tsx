import { ArrowUpCircleIcon } from '@heroicons/react/24/solid';
import { Button } from '@mantine/core';

interface Props {
  prevScrollPos: number;
}

const ScrollTopTopButton = ({ prevScrollPos }: Props) => {
  return (
    <Button
      className={`fixed bottom-16 right-4 z-50 rounded-full border border-blue-300/50 bg-[#f4f9ff] dark:border-blue-300/20 dark:bg-[#2b3542] md:bottom-4 md:right-8 ${
        prevScrollPos <= 100 ? 'hidden' : ''
      }`}
      size="md"
      variant="subtle"
      onClick={() => {
        document?.getElementById('content')?.scrollTo(0, 0);
      }}
    >
      <ArrowUpCircleIcon className="h-6 w-6" />
    </Button>
  );
};

export default ScrollTopTopButton;
