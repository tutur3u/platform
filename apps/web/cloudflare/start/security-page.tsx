import type { ReactNode } from 'react';
import en from '../../messages/en.json';
import vi from '../../messages/vi.json';
import type { NativeSecurityKind } from '../native-security';

function Section({
  badge,
  index,
  title,
  description,
  children,
}: {
  badge: string;
  index: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section>
      <p>
        {index} {badge}
      </p>
      <h2>{title}</h2>
      <p>{description}</p>
      {children}
    </section>
  );
}

function Cards({ items }: { items: { title: string; description: string }[] }) {
  return items.map((item) => (
    <article key={item.title}>
      <h3>{item.title}</h3>
      <p>{item.description}</p>
    </article>
  ));
}

function Checklist({ items }: { items: string[] }) {
  return (
    <ul>
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

export function SecurityPage({
  kind,
  locale,
}: {
  kind: NativeSecurityKind;
  locale: 'en' | 'vi';
}) {
  const messages = locale === 'vi' ? vi : en;
  const copy = messages[kind];
  const prefix = locale === 'vi' ? '/vi' : '';
  const policy = kind === 'security-policy';
  return (
    <main>
      <header>
        <p>{copy.hero.badge}</p>
        <h1>
          {copy.hero.title_prefix} {copy.hero.title_highlight}
        </h1>
        <p>{copy.hero.description}</p>
        <a href="mailto:security@tuturuuu.com">{copy.hero.report_cta}</a>{' '}
        {policy ? (
          <a href={`${prefix}/security/bug-bounty`}>
            {messages['security-policy'].hero.hall_cta}
          </a>
        ) : (
          <a href={`${prefix}/security/policy`}>
            {messages['bug-bounty'].hero.policy_cta}
          </a>
        )}
      </header>
      {policy ? (
        <Policy copy={messages['security-policy']} prefix={prefix} />
      ) : (
        <Bounty copy={messages['bug-bounty']} prefix={prefix} />
      )}
    </main>
  );
}

function Policy({
  copy,
  prefix,
}: {
  copy: (typeof en)['security-policy'];
  prefix: string;
}) {
  return (
    <>
      <section>
        <p>{copy.reporting.eyebrow}</p>
        <h2>{copy.reporting.title}</h2>
        <p>{copy.reporting.description}</p>
        <dl>
          <div>
            <dt>{copy.reporting.email_label}</dt>
            <dd>security@tuturuuu.com</dd>
          </div>
          <div>
            <dt>{copy.reporting.ack_label}</dt>
            <dd>{copy.reporting.ack_value}</dd>
          </div>
          <div>
            <dt>{copy.reporting.credit_label}</dt>
            <dd>{copy.reporting.credit_value}</dd>
          </div>
        </dl>
      </section>
      <Section
        badge={copy.workflow.badge}
        index="01"
        title={copy.workflow.title}
        description={copy.workflow.description}
      >
        <Cards
          items={[
            copy.workflow.steps.private,
            copy.workflow.steps.safe,
            copy.workflow.steps.credit,
          ]}
        />
      </Section>
      <Section
        badge={copy.scope.badge}
        index="02"
        title={copy.scope.title}
        description={copy.scope.description}
      >
        <article>
          <h3>{copy.scope.in_scope.title}</h3>
          <Checklist
            items={[
              copy.scope.in_scope.items.core,
              copy.scope.in_scope.items.auth,
              copy.scope.in_scope.items.data,
              copy.scope.in_scope.items.public_apps,
            ]}
          />
        </article>
        <article>
          <h3>{copy.scope.out_of_scope.title}</h3>
          <Checklist
            items={[
              copy.scope.out_of_scope.items.social,
              copy.scope.out_of_scope.items.dos,
              copy.scope.out_of_scope.items.physical,
              copy.scope.out_of_scope.items.upstream,
            ]}
          />
        </article>
      </Section>
      <Section
        badge={copy.rules.badge}
        index="03"
        title={copy.rules.title}
        description={copy.rules.description}
      >
        <article>
          <h3>{copy.rules.badge}</h3>
          <Checklist
            items={[
              copy.rules.items.private,
              copy.rules.items.minimum,
              copy.rules.items.no_persistence,
              copy.rules.items.no_data_access,
              copy.rules.items.no_service_disruption,
            ]}
          />
        </article>
        <article>
          <h3>{copy.rules.include.title}</h3>
          <Checklist
            items={[
              copy.rules.include.items.summary,
              copy.rules.include.items.steps,
              copy.rules.include.items.impact,
              copy.rules.include.items.contact,
            ]}
          />
        </article>
      </Section>
      <Section
        badge={copy.response.badge}
        index="04"
        title={copy.response.title}
        description={copy.response.description}
      >
        <Cards
          items={[
            copy.response.items.ack,
            copy.response.items.triage,
            copy.response.items.credit,
          ]}
        />
      </Section>
      <Section
        badge={copy.response.badge}
        index="05"
        title={copy.cta.title}
        description={copy.cta.description}
      >
        <a href="mailto:security@tuturuuu.com">{copy.cta.report_cta}</a>{' '}
        <a href={`${prefix}/security/bug-bounty`}>{copy.cta.hall_cta}</a>
      </Section>
    </>
  );
}

function Bounty({
  copy,
  prefix,
}: {
  copy: (typeof en)['bug-bounty'];
  prefix: string;
}) {
  const researchers = [copy.researchers.rana, copy.researchers.vapour];
  return (
    <>
      <section>
        <p>{copy.community.eyebrow}</p>
        <h2>{copy.community.title}</h2>
        <p>{copy.community.description}</p>
        <dl>
          <div>
            <dt>{copy.community.metrics.reports}</dt>
            <dd>{researchers.length}</dd>
          </div>
          <div>
            <dt>{copy.community.metrics.credit}</dt>
            <dd>{copy.community.public_credit}</dd>
          </div>
          <div>
            <dt>{copy.community.metrics.channel}</dt>
            <dd>security@tuturuuu.com</dd>
          </div>
        </dl>
      </section>
      <Section
        badge={copy.hall.badge}
        index="01"
        title={copy.hall.title}
        description={copy.hall.description}
      >
        {researchers.map((researcher) => (
          <article key={researcher.name}>
            <p>{researcher.status}</p>
            <h3>{researcher.name}</h3>
            <p>{researcher.report}</p>
            <p>
              {researcher.date} {researcher.cwe}
            </p>
            <p>{researcher.impact}</p>
            <p>{researcher.note}</p>
          </article>
        ))}
      </Section>
      <Section
        badge={copy.hall.badge}
        index="02"
        title={copy.program.title}
        description={copy.program.description}
      >
        <Cards
          items={[
            copy.program.steps.private,
            copy.program.steps.triage,
            copy.program.steps.scope,
            copy.program.steps.credit,
          ]}
        />
        <a href="mailto:security@tuturuuu.com">{copy.program.contact_cta}</a>{' '}
        <a href={`${prefix}/security`}>{copy.program.security_cta}</a>
      </Section>
    </>
  );
}
