import { useLocale, useTranslations } from 'next-intl';
import type { CrawlerReadOnlyLabels } from './types';

export function useCrawlerReadOnlyLabels(): CrawlerReadOnlyLabels {
  const t = useTranslations('ws-crawlers');

  return {
    crawled: {
      title: t('crawled'),
    },
    feature: {
      description: t('description'),
      pluralTitle: t('plural'),
      singularTitle: t('singular'),
    },
    filters: {
      allDomains: t('all_domains'),
      domain: t('filter_by_domain'),
      pageSize: t('page_size'),
      pageSizeOption: t('page_size_option'),
      reset: t('reset_filters'),
      search: t('search_urls'),
    },
    navigation: {
      crawled: t('crawled'),
      uncrawled: t('uncrawled'),
    },
    stats: {
      allCaughtUp: t('all_caught_up'),
      domains: t('domains'),
      title: t('quick_stats'),
      uncrawledUrls: t('uncrawled_urls'),
      uniqueDomainsDiscovered: t('unique_domains_discovered'),
      waitingToBeCrawled: t('waiting_to_be_crawled'),
    },
    status: {
      hasHtml: t('has_html'),
      hasMarkdown: t('has_markdown'),
      missingHtml: t('missing_html'),
      missingMarkdown: t('missing_markdown'),
    },
    uncrawled: {
      emptyDescription: t('uncrawled_empty_description'),
      emptyTitle: t('uncrawled_empty_title'),
      noResultsDescription: t('uncrawled_no_results_description'),
      noResultsTitle: t('uncrawled_no_results_title'),
      originFallback: t('origin_unknown'),
      showingRange: t('showing_range'),
      sourceUrl: t('source_url'),
      title: t('uncrawled'),
      urlCountPlural: t('url_count_plural'),
      urlCountSingular: t('url_count_singular'),
      waitingPlural: t('waiting_count_plural'),
      waitingSingular: t('waiting_count_singular'),
    },
  };
}

export function useCrawlerLocale() {
  return useLocale();
}
