import {
  Bot,
  Boxes,
  Building2,
  Calendar,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  FileText,
  Folder,
  GraduationCap,
  Mail,
  MessageSquare,
  Package,
  QrCode,
  Store,
  Users,
  Wallet,
  Zap,
} from '@/components/landing/shared/static-icons';
import { useTranslations } from 'next-intl';
import type { ComponentType } from 'react';

/** Every app in the suite, in the order the mega-menu groups them. */
const items: Array<{
  key: string;
  icon: ComponentType<{ className?: string }>;
  accent: string;
}> = [
  { key: 'calendar', icon: Calendar, accent: 'text-dynamic-blue' },
  { key: 'tasks', icon: CheckCircle2, accent: 'text-dynamic-green' },
  { key: 'meet', icon: Users, accent: 'text-dynamic-purple' },
  { key: 'workflows', icon: Zap, accent: 'text-dynamic-cyan' },
  { key: 'track', icon: CalendarClock, accent: 'text-dynamic-orange' },
  { key: 'forms', icon: ClipboardList, accent: 'text-dynamic-indigo' },
  { key: 'documents', icon: FileText, accent: 'text-dynamic-orange' },
  { key: 'drive', icon: Folder, accent: 'text-dynamic-yellow' },
  { key: 'mail', icon: Mail, accent: 'text-dynamic-red' },
  { key: 'chat', icon: MessageSquare, accent: 'text-dynamic-cyan' },
  { key: 'ai', icon: Bot, accent: 'text-dynamic-purple' },
  { key: 'qr', icon: QrCode, accent: 'text-dynamic-sky' },
  { key: 'finance', icon: Wallet, accent: 'text-dynamic-pink' },
  { key: 'crm', icon: Building2, accent: 'text-dynamic-blue' },
  { key: 'inventory', icon: Package, accent: 'text-dynamic-green' },
  { key: 'storefront', icon: Store, accent: 'text-dynamic-teal' },
  { key: 'hive', icon: Boxes, accent: 'text-dynamic-rose' },
  { key: 'lms', icon: GraduationCap, accent: 'text-dynamic-orange' },
];

/** The suite stays manually scrollable with touch, wheel and keyboard. */
export function ProductMarquee() {
  const t = useTranslations();

  return (
    <section
      aria-label={t('marketing-nav.all_apps')}
      className="relative overflow-hidden border-foreground/[0.08] border-y py-6"
    >
      <div
        className="group flex overflow-x-auto"
        tabIndex={0}
        style={{
          maskImage:
            'linear-gradient(90deg, transparent, black 12%, black 88%, transparent)',
          WebkitMaskImage:
            'linear-gradient(90deg, transparent, black 12%, black 88%, transparent)',
        }}
      >
        <div className="flex w-max items-center gap-8 px-8 sm:gap-12">
          {items.map((item) => (
            <span
              className="flex shrink-0 items-center gap-2.5 whitespace-nowrap font-mono-ui text-[0.72rem] text-foreground/65 uppercase tracking-[0.18em] transition-colors duration-300 hover:text-foreground/80"
              key={item.key}
            >
              <item.icon className={`h-3.5 w-3.5 ${item.accent}`} />
              {t(`marketing-nav.products.${item.key}.label` as never)}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
