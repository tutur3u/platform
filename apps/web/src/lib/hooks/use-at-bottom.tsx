import * as React from 'react';

export function useAtBottom(offset = 0) {
  const [isAtBottom, setIsAtBottom] = React.useState(false);

  React.useEffect(() => {
    const handleScroll = () => {
      const scrolledToBottom =
        Math.ceil(window.scrollY + window.innerHeight) >=
        document.documentElement.scrollHeight - offset;
      setIsAtBottom(scrolledToBottom);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, [offset]);

  return isAtBottom;
}

export function useAtTop(offset = 0) {
  const [isAtTop, setIsAtTop] = React.useState(false);

  React.useEffect(() => {
    const handleScroll = () => {
      setIsAtTop(window.scrollY <= offset);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, [offset]);

  return isAtTop;
}
