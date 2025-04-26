import * as React from 'react';

export function useAtBottom(offset = 0) {
  const [isAtBottom, setIsAtBottom] = React.useState(false);
  const [element, setElement] = React.useState<HTMLElement | null>(null);

  React.useEffect(() => {
    const el = document.getElementById('main-content');
    setElement(el);
    return () => {
      setElement(null);
    };
  }, []);

  React.useEffect(() => {
    const handleScroll = () => {
      if (!element) return;
      const scrolledToBottom =
        Math.ceil(element.scrollTop + element.clientHeight) >=
        element.scrollHeight - offset;

      setIsAtBottom(scrolledToBottom);
    };

    element?.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => {
      element?.removeEventListener('scroll', handleScroll);
    };
  }, [element, offset]);

  return isAtBottom;
}

export function useAtTop(offset = 0) {
  const [isAtTop, setIsAtTop] = React.useState(false);
  const [element, setElement] = React.useState<HTMLElement | null>(null);

  React.useEffect(() => {
    const el = document.getElementById('main-content');
    setElement(el);
    return () => {
      setElement(null);
    };
  }, []);

  React.useEffect(() => {
    if (!element) return;

    const handleScroll = () => {
      setIsAtTop(element.scrollTop <= offset);
    };

    element.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => {
      element.removeEventListener('scroll', handleScroll);
    };
  }, [element, offset]);

  return isAtTop;
}
