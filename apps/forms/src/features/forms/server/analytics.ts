import type { SupabaseClient } from '@tuturuuu/supabase';
import type { Database } from '@tuturuuu/types';
import type { FormAnalytics, FormDefinition } from '../types';
import { runUntypedRpc } from './client';

const EMPTY_FORM_ANALYTICS: FormAnalytics = {
  totalViews: 0,
  totalStarts: 0,
  totalSubmissions: 0,
  totalAbandons: 0,
  startRate: 0,
  completionRate: 0,
  completionFromStartsRate: 0,
  avgCompletionSeconds: 0,
  uniqueReferrers: 0,
  uniqueCountries: 0,
  responderModeBreakdown: [],
  topReferrers: [],
  devices: [],
  browsers: [],
  operatingSystems: [],
  countries: [],
  cities: [],
  dropoffBySection: [],
  dropoffByQuestion: [],
  activity: [],
};

function toNumber(value: unknown): number {
  return typeof value === 'number'
    ? value
    : typeof value === 'string'
      ? Number(value) || 0
      : 0;
}

function parseLabelValueList(
  value: unknown
): Array<{ label: string; value: number }> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') {
      return [];
    }

    const label = 'label' in item ? item.label : '';
    return typeof label === 'string'
      ? [
          {
            label,
            value: toNumber('value' in item ? item.value : 0),
          },
        ]
      : [];
  });
}

function parseFormAnalytics(value: unknown): FormAnalytics {
  if (!value || typeof value !== 'object') {
    return EMPTY_FORM_ANALYTICS;
  }

  const rawDropoffBySection =
    'dropoffBySection' in value ? value.dropoffBySection : [];
  const rawDropoffByQuestion =
    'dropoffByQuestion' in value ? value.dropoffByQuestion : [];
  const rawActivity = 'activity' in value ? value.activity : [];

  return {
    totalViews: toNumber('totalViews' in value ? value.totalViews : 0),
    totalStarts: toNumber('totalStarts' in value ? value.totalStarts : 0),
    totalSubmissions: toNumber(
      'totalSubmissions' in value ? value.totalSubmissions : 0
    ),
    totalAbandons: toNumber('totalAbandons' in value ? value.totalAbandons : 0),
    startRate: toNumber('startRate' in value ? value.startRate : 0),
    completionRate: toNumber(
      'completionRate' in value ? value.completionRate : 0
    ),
    completionFromStartsRate: toNumber(
      'completionFromStartsRate' in value ? value.completionFromStartsRate : 0
    ),
    avgCompletionSeconds: toNumber(
      'avgCompletionSeconds' in value ? value.avgCompletionSeconds : 0
    ),
    uniqueReferrers: toNumber(
      'uniqueReferrers' in value ? value.uniqueReferrers : 0
    ),
    uniqueCountries: toNumber(
      'uniqueCountries' in value ? value.uniqueCountries : 0
    ),
    responderModeBreakdown: parseLabelValueList(
      'responderModeBreakdown' in value ? value.responderModeBreakdown : []
    ),
    topReferrers: parseLabelValueList(
      'topReferrers' in value ? value.topReferrers : []
    ),
    devices: parseLabelValueList('devices' in value ? value.devices : []),
    browsers: parseLabelValueList('browsers' in value ? value.browsers : []),
    operatingSystems: parseLabelValueList(
      'operatingSystems' in value ? value.operatingSystems : []
    ),
    countries: parseLabelValueList('countries' in value ? value.countries : []),
    cities: parseLabelValueList('cities' in value ? value.cities : []),
    dropoffBySection: Array.isArray(rawDropoffBySection)
      ? rawDropoffBySection.flatMap((entry: unknown) => {
          if (!entry || typeof entry !== 'object') {
            return [];
          }

          const sectionId = 'sectionId' in entry ? entry.sectionId : '';
          const title = 'title' in entry ? entry.title : '';
          if (typeof sectionId !== 'string' || typeof title !== 'string') {
            return [];
          }

          return [
            {
              sectionId,
              title,
              count: toNumber('count' in entry ? entry.count : 0),
            },
          ];
        })
      : [],
    dropoffByQuestion: Array.isArray(rawDropoffByQuestion)
      ? rawDropoffByQuestion.flatMap((entry: unknown) => {
          if (!entry || typeof entry !== 'object') {
            return [];
          }

          const questionId = 'questionId' in entry ? entry.questionId : '';
          const title = 'title' in entry ? entry.title : '';
          if (typeof questionId !== 'string' || typeof title !== 'string') {
            return [];
          }

          return [
            {
              questionId,
              title,
              count: toNumber('count' in entry ? entry.count : 0),
            },
          ];
        })
      : [],
    activity: Array.isArray(rawActivity)
      ? rawActivity.flatMap((entry: unknown) => {
          if (!entry || typeof entry !== 'object') {
            return [];
          }

          const date = 'date' in entry ? entry.date : '';
          if (typeof date !== 'string') {
            return [];
          }

          return [
            {
              date,
              views: toNumber('views' in entry ? entry.views : 0),
              starts: toNumber('starts' in entry ? entry.starts : 0),
              submissions: toNumber(
                'submissions' in entry ? entry.submissions : 0
              ),
            },
          ];
        })
      : [],
  };
}

export async function getFormAnalytics(
  supabase: SupabaseClient<Database>,
  form: FormDefinition
): Promise<FormAnalytics> {
  const analytics = await runUntypedRpc<unknown>(
    supabase,
    'get_form_analytics_overview',
    {
      p_form_id: form.id,
    }
  );

  return parseFormAnalytics(analytics);
}
