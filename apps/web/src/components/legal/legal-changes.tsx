import {
  diffLegalDocuments,
  getLegalDocument,
  getLegalNotice,
  getProposedLegalDocument,
  type LegalLocale,
  type LegalNoticeConfig,
  legalChangesCopy,
  legalNoticeCopy,
} from '@tuturuuu/legal';
import { ChangeControls, ChangeToc } from './change-controls';
import { changeCopy } from './change-copy';
import { ChangeVersions } from './change-versions';
import { LegalHubNav } from './legal-hub-nav';
import { LegalMarkdown } from './legal-markdown';
import { ProposedLegalDocuments } from './proposed-legal-documents';
import { RedlineView } from './redline-view';
import './legal-changes.css';

const kinds = [
  'terms',
  'privacy',
  'dpa',
  'sla',
  'subprocessors',
  'acceptable-use',
  'community-guidelines',
] as const;
export function LegalChanges({
  locale,
  full = false,
  noticeConfig,
}: {
  locale: LegalLocale;
  full?: boolean;
  noticeConfig?: LegalNoticeConfig;
}) {
  const copy = changeCopy[locale],
    variant = legalChangesCopy[locale];
  const notice = getLegalNotice(locale, noticeConfig);
  const groups = kinds.map((kind) => {
    const current = getLegalDocument(kind, locale),
      proposed = getProposedLegalDocument(kind, locale);
    return {
      kind,
      current,
      proposed,
      changes: diffLegalDocuments(current.sections, proposed.sections).filter(
        (change) => change.kind !== 'unchanged'
      ),
    };
  });
  const [intro = '', ...summary] = variant.summary.split(/\n(?=## )/u);
  const [heading = '', ...introBody] = intro.split('\n');
  return (
    <main className="legal-changes" lang={locale}>
      <a className="legal-skip" href="#legal-main">
        {copy.skip}
      </a>
      <LegalHubNav locale={locale} />
      <div className="change-status">
        <strong>{notice ? copy.published : copy.notice}</strong>
        {!notice && <p>{variant.notInEffect}</p>}
      </div>
      <header id="legal-main" tabIndex={-1}>
        <h1>
          {full
            ? variant.fullTitle
            : (notice?.title ?? heading.replace(/^# /u, ''))}
        </h1>
        <section
          className="binding-notice"
          aria-label={notice ? notice.title : copy.notice}
          data-binding-notice="true"
        >
          <LegalMarkdown>
            {notice?.binding ?? introBody.join('\n')}
          </LegalMarkdown>
        </section>
      </header>
      <ChangeVersions locale={locale} notice={notice} />
      <ChangeControls locale={locale} full={full} />
      <div className="change-layout">
        <ChangeToc
          locale={locale}
          items={groups.map((group) => ({
            id: `changes-${group.kind}`,
            title: `${group.proposed.title} ${group.proposed.highlightedWord}`,
          }))}
        />
        <div>
          {!full && (
            <aside className="change-summary" aria-label={copy.summary}>
              <strong>{copy.summary}</strong>
              <h2>
                {notice?.summaryTitle ??
                  summary[0]?.split('\n')[0]?.replace(/^## /u, '')}
              </h2>
              {notice ? (
                <>
                  <div className="summary-table">
                    <table>
                      <thead>
                        <tr>
                          {notice.tableHead.map((cell) => (
                            <th key={cell} scope="col">
                              {cell}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {notice.rows.map((row) => (
                          <tr key={row[0]}>
                            {row.map((cell, index) =>
                              index === 0 ? (
                                <th key={index} scope="row">
                                  {cell}
                                </th>
                              ) : (
                                <td key={index}>{cell}</td>
                              )
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p>{notice.nonbinding}</p>
                  <LegalMarkdown>
                    {notice.links.replace(/^- /gmu, '* ')}
                  </LegalMarkdown>
                </>
              ) : (
                <>
                  {summary.map((block) => (
                    <LegalMarkdown key={block}>
                      {block
                        .replace(/^## [^\n]+\n/u, '')
                        .replace(/\n {2}/gu, ' ')
                        .replace(/^- /gmu, '* ')
                        .replace(
                          /\]\((\/legal\/changes[^)]*)\)/gu,
                          locale === 'vi' ? '](/vi$1)' : ']($1)'
                        )}
                    </LegalMarkdown>
                  ))}
                  <p>{legalNoticeCopy[locale].nonbinding}</p>
                </>
              )}
            </aside>
          )}
          {groups.map((group) => (
            <section
              className="change-document"
              id={`changes-${group.kind}`}
              key={group.kind}
              aria-labelledby={`title-${group.kind}`}
            >
              <h2 id={`title-${group.kind}`}>
                {group.proposed.title} {group.proposed.highlightedWord}
              </h2>
              {group.changes.map((change) => (
                <section
                  className="change-card"
                  key={change.id}
                  id={change.id}
                  aria-labelledby={`title-${change.id}`}
                >
                  <header>
                    <span className={`change-chip ${change.kind}`}>
                      {copy[change.kind]}
                    </span>
                    <h3 id={`title-${change.id}`}>{change.title}</h3>
                  </header>
                  {!full && (
                    <div className="change-excerpt">
                      <LegalMarkdown>
                        {(
                          group.proposed.sections.find(
                            (section) => section.id === change.id
                          ) ??
                          group.current.sections.find(
                            (section) => section.id === change.id
                          )
                        )?.content.split('\n\n')[0] ?? ''}
                      </LegalMarkdown>
                    </div>
                  )}
                  {full ? (
                    <RedlineView change={change} locale={locale} />
                  ) : (
                    <details>
                      <summary>{copy.exact}</summary>
                      <RedlineView change={change} locale={locale} />
                    </details>
                  )}
                </section>
              ))}
            </section>
          ))}
          {full && <ProposedLegalDocuments locale={locale} />}
        </div>
      </div>
    </main>
  );
}
