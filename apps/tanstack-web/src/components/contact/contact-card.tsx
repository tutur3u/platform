import { Check, Github, Mail } from '@tuturuuu/icons/lucide';
import { Card } from '@tuturuuu/ui/card';
import {
  type ContactCardItem,
  type ContactMessages,
  contactToneClassNames,
  founderIcon,
} from '../../data/contact/contact-content';

export function ContactMethodCard({ item }: { item: ContactCardItem }) {
  const tone = contactToneClassNames[item.tone];
  const Icon = item.icon;

  return (
    <Card
      className={`group h-full p-6 transition-all hover:shadow-lg ${tone.border} ${tone.surface} ${tone.hover}`}
    >
      <div
        className={`mb-4 flex h-12 w-12 items-center justify-center rounded-xl transition-transform group-hover:rotate-12 group-hover:scale-110 ${tone.symbol}`}
      >
        <Icon className={`h-6 w-6 ${tone.icon}`} />
      </div>
      <h3 className="mb-2 font-semibold text-lg">{item.title}</h3>
      {item.href ? (
        <a
          className={`mb-2 block text-sm transition-colors ${tone.link}`}
          href={item.href}
        >
          {item.value}
        </a>
      ) : (
        <p className="mb-2 text-foreground/60 text-sm">{item.value}</p>
      )}
      <p className="text-foreground/60 text-sm">{item.description}</p>
    </Card>
  );
}

export function ContactHighlightCard({ item }: { item: ContactCardItem }) {
  const tone = contactToneClassNames[item.tone];
  const Icon = item.icon;

  return (
    <Card
      className={`group p-6 transition-all hover:shadow-lg ${tone.border} ${tone.surface} ${tone.hover}`}
    >
      <div className="flex items-start gap-4">
        <div
          className={`flex h-12 w-12 items-center justify-center rounded-xl transition-transform group-hover:rotate-12 group-hover:scale-110 ${tone.symbol}`}
        >
          <Icon className={`h-6 w-6 ${tone.icon}`} />
        </div>
        <div className="flex-1">
          <h3 className="mb-1 font-semibold text-lg">{item.title}</h3>
          <p className="text-foreground/60 text-sm">{item.description}</p>
        </div>
      </div>
    </Card>
  );
}

export function FounderCard({ messages }: { messages: ContactMessages }) {
  const Rocket = founderIcon;

  return (
    <Card className="group border-dynamic-pink/30 bg-linear-to-br from-dynamic-pink/5 via-background to-background p-6">
      <div className="mb-4 flex items-start gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-dynamic-pink/10">
          <Rocket className="h-8 w-8 text-dynamic-pink" />
        </div>
        <div>
          <h3 className="mb-1 font-bold text-xl">{messages.founder.name}</h3>
          <p className="text-foreground/60 text-sm">{messages.founder.role}</p>
        </div>
      </div>

      <p className="mb-6 text-foreground/70 text-sm leading-relaxed">
        {messages.founder.description}
      </p>

      <div className="space-y-3">
        <FounderLink href="mailto:phucvo@tuturuuu.com" icon={Mail} tone="pink">
          <span>{messages.founder.contact.email}</span>
          <span>phucvo@tuturuuu.com</span>
        </FounderLink>
        <FounderLink href="https://github.com/vhpx" icon={Github} tone="purple">
          <span>{messages.founder.contact.github}</span>
          <span>@vhpx</span>
        </FounderLink>
      </div>
    </Card>
  );
}

export function QuickLinksCard({
  locale,
  messages,
}: {
  locale: string;
  messages: ContactMessages;
}) {
  return (
    <Card className="border-dynamic-blue/30 bg-linear-to-br from-dynamic-blue/5 via-background to-background p-6">
      <h3 className="mb-4 font-semibold text-lg">
        {messages.quickLinks.title}
      </h3>
      <div className="space-y-2">
        <QuickLink
          href={`/${locale}/about`}
          label={messages.quickLinks.about}
        />
        <QuickLink
          href={`/${locale}?hash-nav=1#pricing`}
          label={messages.quickLinks.pricing}
        />
        <QuickLink
          href="https://github.com/tutur3u/platform"
          label={messages.quickLinks.github}
          target="_blank"
        />
      </div>
    </Card>
  );
}

function FounderLink({
  children,
  href,
  icon: Icon,
  tone,
}: {
  children: [React.ReactNode, React.ReactNode];
  href: string;
  icon: typeof Mail;
  tone: 'pink' | 'purple';
}) {
  const toneClass =
    tone === 'pink'
      ? 'border-dynamic-pink/20 bg-dynamic-pink/5 hover:border-dynamic-pink/40 hover:bg-dynamic-pink/10 text-dynamic-pink'
      : 'border-dynamic-purple/20 bg-dynamic-purple/5 hover:border-dynamic-purple/40 hover:bg-dynamic-purple/10 text-dynamic-purple';

  return (
    <a
      className={`flex items-center gap-3 rounded-lg border p-3 transition-all ${toneClass}`}
      href={href}
      rel={href.startsWith('http') ? 'noopener noreferrer' : undefined}
      target={href.startsWith('http') ? '_blank' : undefined}
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-current/10">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <div className="font-medium text-foreground text-sm">{children[0]}</div>
        <div className="text-xs">{children[1]}</div>
      </div>
    </a>
  );
}

function QuickLink({
  href,
  label,
  target,
}: {
  href: string;
  label: string;
  target?: '_blank';
}) {
  return (
    <a
      className="flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-dynamic-blue/10"
      href={href}
      rel={target ? 'noopener noreferrer' : undefined}
      target={target}
    >
      <Check className="h-4 w-4 text-dynamic-blue" />
      <span className="text-sm">{label}</span>
    </a>
  );
}
