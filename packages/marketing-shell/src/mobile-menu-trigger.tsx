import type { ComponentProps } from 'react';
import type { Translate } from './i18n';
import { navIconButton } from './nav-styles';
import { Menu } from './static-icons';

/** The menu button, identical before and after the sheet code loads. */
export function MobileMenuTrigger({
  t,
  ...props
}: ComponentProps<'button'> & { t: Translate }) {
  return (
    <button
      aria-label={t('common.main_navigation')}
      className={navIconButton}
      type="button"
      {...props}
    >
      <Menu className="size-5" />
    </button>
  );
}
