'use client';

import type {
  CitationEditorConfig,
  CitationLabels,
} from '@tuturuuu/ui/text-editor/citation';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { createDocumentCitationAdapter } from './document-citation-adapter';
import { DocumentCitationManualEditor } from './document-citation-manual-editor';
import { createDocumentCitationTransport } from './document-citation-transport';

const LOCATOR_LABELS = [
  'page',
  'chapter',
  'section',
  'paragraph',
  'figure',
  'table',
  'line',
] as const;

const ISSUE_FIELD_KEYS = {
  authors: 'authors',
  issued: 'issued',
  containerTitle: 'container_title',
  publisher: 'publisher',
  publisherPlace: 'publisher_place',
  url: 'url',
  accessed: 'accessed',
  modelName: 'model_name',
  indigenous: 'indigenous',
  provenance: 'provenance',
  other: 'other',
} as const satisfies Record<keyof CitationLabels['issueFields'], string>;

const REPAIR_FAILURE_KEYS = {
  creditsExhausted: 'credits_exhausted',
  notAllowed: 'not_allowed',
  unavailable: 'unavailable',
  billingPending: 'billing_pending',
  inProgress: 'in_progress',
  chargedInvalid: 'charged_invalid',
  offline: 'offline',
  expired: 'expired',
  generic: 'generic',
} as const satisfies Record<keyof CitationLabels['repairFailure'], string>;

function mapKeys<K extends string, V extends string>(
  keys: Record<K, V>,
  translate: (key: V) => string
) {
  return Object.fromEntries(
    Object.entries(keys).map(([field, key]) => [field, translate(key as V)])
  ) as Record<K, string>;
}

function useCitationLabels(): CitationLabels {
  const t = useTranslations('documents.citations');
  const credits = useTranslations('cite.attribution');
  return useMemo(
    () => ({
      insert: t('insert'),
      drawerTitle: t('drawer_title'),
      drawerDescription: t('drawer_description'),
      libraryTab: t('library_tab'),
      captureTab: t('capture_tab'),
      librarySearch: t('library_search'),
      libraryEmpty: t('library_empty'),
      libraryNoMatch: t('library_no_match'),
      captureInput: t('capture_input'),
      capturePlaceholder: t('capture_placeholder'),
      captureSubmit: t('capture_submit'),
      titleSearch: t('title_search'),
      candidatesHint: t('candidates_hint'),
      reviewHint: t('review_hint'),
      useSource: t('use_source'),
      manualEntry: t('manual_entry'),
      completeManually: t('complete_manually'),
      saveAndUse: t('save_and_use'),
      // loading-text-allowed: label prop; the citation library tab renders it
      loading: t('loading'),
      retry: t('retry'),
      errorGeneric: t('error_generic'),
      invalidWork: t('invalid_work'),
      unavailable: {
        not_provisioned: t('unavailable.not_provisioned'),
        forbidden: t('unavailable.forbidden'),
        offline: t('unavailable.offline'),
        insufficient_credits: t('unavailable.insufficient_credits'),
      },
      styles: { apa: t('styles.apa'), harvard: t('styles.harvard') },
      style: t('style'),
      references: t('references'),
      referencesEmpty: t('references_empty'),
      locator: t('locator'),
      locatorValue: t('locator_value'),
      locatorNone: t('locator_none'),
      locatorLabels: Object.fromEntries(
        LOCATOR_LABELS.map((label) => [label, t(`locator_labels.${label}`)])
      ) as CitationLabels['locatorLabels'],
      suppressAuthor: t('suppress_author'),
      remove: t('remove'),
      replace: t('replace'),
      repair: t('repair'),
      repairing: t('repairing'),
      repairReview: t('repair_review'),
      uncertainFields: t('uncertain_fields'),
      applyRepair: t('apply_repair'),
      discard: t('discard'),
      updateFromLibrary: t('update_from_library'),
      repairConfirm: t('repair_confirm'),
      repairContinue: t('repair_continue'),
      cancel: t('cancel'),
      repairCharged: (count: number) => t('repair_charged', { credits: count }),
      repairStale: t('repair_stale'),
      repairCheckAgain: t('repair_check_again'),
      repairTryAgain: t('repair_try_again'),
      repairFailure: mapKeys(REPAIR_FAILURE_KEYS, (key) =>
        t(`repair_failure.${key}`)
      ),
      repairRaw: t('repair_raw'),
      editSource: t('edit_source'),
      saveChanges: t('save_changes'),
      libraryConflict: t('library_conflict'),
      discardAndReload: t('discard_and_reload'),
      deleteSource: t('delete_source'),
      deleteSourceTitle: t('delete_source_title'),
      deleteSourceDescription: t('delete_source_description'),
      issuesHeading: t('issues_heading'),
      issueRequired: t('issue_required'),
      issueRecommended: t('issue_recommended'),
      issueFields: mapKeys(ISSUE_FIELD_KEYS, (key) => t(`issue_fields.${key}`)),
      attribution: {
        heading: credits('heading'),
        engineNotice: credits('engine_notice'),
        engineLicense: credits('engine_license'),
        engineSource: credits('engine_source'),
        engineLicenseLink: credits('engine_license_link'),
        styles: credits('styles'),
        stylesSource: credits('styles_source'),
      },
      status: {
        invalid: t('status.invalid'),
        unlinked: t('status.unlinked'),
        checking: t('status.checking'),
        linked: t('status.linked'),
        updateAvailable: t('status.update_available'),
        detached: t('status.detached'),
        libraryUnavailable: t('status.library_unavailable'),
      },
      untitled: t('untitled'),
      edit: t('edit'),
    }),
    [t, credits]
  );
}

/**
 * Citation support for one workspace document. Citations live only in the
 * document JSON; the library and AI repair fail closed with typed unavailable
 * states until their server features are provisioned.
 */
export function useDocumentCitations(wsId: string): CitationEditorConfig {
  const labels = useCitationLabels();
  const adapter = useMemo(
    () => ({
      ...createDocumentCitationAdapter(createDocumentCitationTransport(wsId)),
      renderManualEditor: (
        props: Parameters<typeof DocumentCitationManualEditor>[0]
      ) => <DocumentCitationManualEditor {...props} />,
    }),
    [wsId]
  );
  return useMemo(() => ({ adapter, labels }), [adapter, labels]);
}
