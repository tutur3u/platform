import type {
  CitationIssueField,
  CitationRepairFailureKind,
} from './label-keys';
import type {
  CitationLocatorLabel,
  CitationStyleId,
  CitationUnavailableReason,
} from './types';

export interface CitationLabels {
  insert: string;
  drawerTitle: string;
  drawerDescription: string;
  libraryTab: string;
  captureTab: string;
  librarySearch: string;
  libraryEmpty: string;
  libraryNoMatch: string;
  captureInput: string;
  capturePlaceholder: string;
  captureSubmit: string;
  titleSearch: string;
  candidatesHint: string;
  reviewHint: string;
  useSource: string;
  manualEntry: string;
  completeManually: string;
  saveAndUse: string;
  loading: string;
  retry: string;
  errorGeneric: string;
  invalidWork: string;
  unavailable: Record<CitationUnavailableReason, string>;
  styles: Record<CitationStyleId, string>;
  style: string;
  references: string;
  referencesEmpty: string;
  locator: string;
  locatorValue: string;
  locatorNone: string;
  locatorLabels: Record<CitationLocatorLabel, string>;
  suppressAuthor: string;
  remove: string;
  replace: string;
  repair: string;
  repairing: string;
  repairReview: string;
  uncertainFields: string;
  applyRepair: string;
  discard: string;
  updateFromLibrary: string;
  /** Shown before the first paid request for a snapshot; no fixed price. */
  repairConfirm: string;
  repairContinue: string;
  cancel: string;
  repairCharged: (credits: number) => string;
  repairStale: string;
  repairCheckAgain: string;
  repairTryAgain: string;
  repairFailure: Record<CitationRepairFailureKind, string>;
  /** Repair action for a pasted reference that capture could not resolve. */
  repairRaw: string;
  editSource: string;
  saveChanges: string;
  libraryConflict: string;
  discardAndReload: string;
  deleteSource: string;
  deleteSourceTitle: string;
  deleteSourceDescription: string;
  issuesHeading: string;
  issueRequired: string;
  issueRecommended: string;
  issueFields: Record<CitationIssueField, string>;
  attribution: {
    heading: string;
    engineNotice: string;
    engineLicense: string;
    engineSource: string;
    engineLicenseLink: string;
    styles: string;
    stylesSource: string;
  };
  status: {
    invalid: string;
    unlinked: string;
    checking: string;
    linked: string;
    updateAvailable: string;
    detached: string;
    libraryUnavailable: string;
  };
  untitled: string;
  edit: string;
}

export const DEFAULT_CITATION_LABELS: CitationLabels = {
  insert: 'Insert citation',
  drawerTitle: 'Citations',
  drawerDescription: 'Choose a saved source or capture a new one.',
  libraryTab: 'Library',
  captureTab: 'Capture',
  librarySearch: 'Search library',
  libraryEmpty: 'No saved sources yet.',
  libraryNoMatch: 'No sources match this search.',
  captureInput: 'URL, DOI, ISBN, arXiv or PubMed ID',
  capturePlaceholder: 'https://doi.org/…',
  captureSubmit: 'Find source',
  titleSearch: 'Search by title',
  candidatesHint: 'Pick the matching source.',
  reviewHint: 'Check the details before citing.',
  useSource: 'Cite',
  manualEntry: 'Enter details manually',
  completeManually: 'Complete details',
  saveAndUse: 'Save and cite',
  loading: 'Loading…',
  retry: 'Retry',
  errorGeneric: 'Something went wrong.',
  invalidWork: 'Some required details are missing.',
  unavailable: {
    not_provisioned: 'The citation library is not available yet.',
    forbidden: 'You do not have access to this library.',
    offline: 'You are offline.',
    insufficient_credits: 'Not enough credits.',
  },
  styles: { apa: 'APA 7', harvard: 'Harvard' },
  style: 'Citation style',
  references: 'References',
  referencesEmpty: 'Citations you add appear here.',
  locator: 'Locator',
  locatorValue: 'Locator value',
  locatorNone: 'None',
  locatorLabels: {
    page: 'Page',
    chapter: 'Chapter',
    section: 'Section',
    paragraph: 'Paragraph',
    figure: 'Figure',
    table: 'Table',
    line: 'Line',
  },
  suppressAuthor: 'Hide author',
  remove: 'Remove',
  replace: 'Replace source',
  repair: 'Repair',
  repairing: 'Repairing…',
  repairReview: 'Review the repaired source.',
  uncertainFields: 'Check these fields',
  applyRepair: 'Apply',
  discard: 'Discard',
  updateFromLibrary: 'Update from library',
  repairConfirm:
    'Repair uses AI and charges your personal credits based on the tokens it uses.',
  repairContinue: 'Continue',
  cancel: 'Cancel',
  repairCharged: (credits) => `${credits} credits charged`,
  repairStale: 'The source changed, so this repair was discarded.',
  repairCheckAgain: 'Check again',
  repairTryAgain: 'Try again',
  repairFailure: {
    creditsExhausted: 'Not enough credits for a repair.',
    notAllowed: 'Repair is not available for your account.',
    unavailable: 'Repair is unavailable right now.',
    billingPending:
      'The charge is not confirmed yet. Check again to continue this same repair.',
    inProgress: 'This repair is still running. Check again shortly.',
    chargedInvalid:
      'The repair result could not be used. This attempt was charged.',
    offline: 'You are offline.',
    expired: 'This repair expired. Try again to start a new one.',
    generic: 'Repair failed.',
  },
  repairRaw: 'Repair with AI',
  editSource: 'Edit source',
  saveChanges: 'Save changes',
  libraryConflict: 'This source changed elsewhere. Your edits were not saved.',
  discardAndReload: 'Discard edits and reload',
  deleteSource: 'Delete',
  deleteSourceTitle: 'Delete this source from the library?',
  deleteSourceDescription:
    'Citations already in documents keep their saved copy.',
  issuesHeading: 'Check these details',
  issueRequired: 'Required',
  issueRecommended: 'Check',
  issueFields: {
    authors: 'Authors',
    issued: 'Date',
    containerTitle: 'Published in',
    publisher: 'Publisher',
    publisherPlace: 'Place of publication',
    url: 'URL',
    accessed: 'Accessed date',
    modelName: 'Model name',
    indigenous: 'Community attribution',
    provenance: 'Source verification',
    other: 'Other details',
  },
  attribution: {
    heading: 'Credits',
    engineNotice:
      'citeproc-js (c) Frank Bennett. citeproc-js implements the Citation Style Language.',
    engineLicense: 'Used under the Common Public Attribution License.',
    engineSource: 'citeproc-js source',
    engineLicenseLink: 'CPAL license',
    styles:
      'Styles from the Citation Style Language project, licensed under CC BY-SA 3.0.',
    stylesSource: 'CSL styles',
  },
  status: {
    invalid: 'Needs repair',
    unlinked: 'Not in library',
    checking: 'Checking library',
    linked: 'In library',
    updateAvailable: 'Library has a newer version',
    detached: 'Removed from library; saved copy kept',
    libraryUnavailable: 'Library unavailable; saved copy used',
  },
  untitled: 'Untitled source',
  edit: 'Edit citation',
};
