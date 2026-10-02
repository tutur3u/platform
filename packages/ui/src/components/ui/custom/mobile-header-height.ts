/** Measure the fixed mobile header including safe-area padding and wrapped rows. */
export function observeMobileHeaderHeight(nav: HTMLElement, main: HTMLElement) {
  const update = () => {
    main.style.setProperty(
      '--mobile-nav-height',
      `${nav.getBoundingClientRect().height}px`
    );
  };
  update();
  const observer = new ResizeObserver(update);
  observer.observe(nav);
  return () => {
    observer.disconnect();
    main.style.removeProperty('--mobile-nav-height');
  };
}
