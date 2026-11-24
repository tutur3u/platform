import type { Timezone } from '@tuturuuu/types/primitives/Timezone';
import timezones from '@tuturuuu/utils/timezones';
import { describe, expect, it } from 'vitest';
import {
  planTimezoneFor,
  planTimezoneLabel,
  timezoneGroup,
  zoneOffsetHours,
} from './plan-timezone';

const groups = timezones as Timezone[];
const group = (text: string) =>
  groups.find((candidate) => candidate.text === text) as Timezone;
const indochina = group('(UTC+07:00) Bangkok, Hanoi, Jakarta');
const winter = new Date('2026-01-15T12:00:00Z');

describe('planTimezoneFor', () => {
  it('keeps the browser zone when it belongs to the picked group', () => {
    expect(planTimezoneFor(indochina, 'Asia/Saigon', winter)).toBe(
      'Asia/Saigon'
    );
  });

  it('picks the zone named in the group label instead of the first listed', () => {
    expect(indochina.utc[0]).toBe('Antarctica/Davis');
    expect(planTimezoneFor(indochina, 'Europe/Paris', winter)).toBe(
      'Asia/Bangkok'
    );
    expect(planTimezoneFor(indochina, null, winter)).toBe('Asia/Bangkok');
  });

  it('prefers a zone at the group offset over the named city', () => {
    const vladivostok = group('(UTC+11:00) Vladivostok');
    const picked = planTimezoneFor(vladivostok, null, winter);
    expect(picked).toBeDefined();
    expect(zoneOffsetHours(picked as string, winter)).toBe(11);
  });

  it('picks the same zone in winter and summer for daylight-saving groups', () => {
    const mountain = group('(UTC-07:00) Mountain Time (US & Canada)');
    const summer = new Date('2026-07-15T12:00:00Z');
    const picked = planTimezoneFor(mountain, null, winter);
    expect(picked).toBe(planTimezoneFor(mountain, null, summer));
    expect(picked).not.toBe('America/Ojinaga');
    expect(zoneOffsetHours(picked as string, winter)).toBe(-7);
  });

  it('uses the label offset when the stored offset is stale', () => {
    const mexico = group('(UTC-06:00) Guadalajara, Mexico City, Monterrey');
    expect(mexico.offset).toBe(-5);
    expect(planTimezoneFor(mexico, null, winter)).toBe('America/Mexico_City');
  });

  it('falls back to the first civil zone, then to the first listed zone', () => {
    const civil: Timezone = {
      value: 'Test',
      abbr: 'T',
      offset: 5,
      isdst: false,
      text: '(UTC+05:00) Nowhere',
      utc: ['Etc/GMT-1', 'Africa/Lagos'],
    };
    expect(planTimezoneFor(civil, null, winter)).toBe('Africa/Lagos');
    expect(
      planTimezoneFor({ ...civil, utc: ['Etc/GMT-1'] }, null, winter)
    ).toBe('Etc/GMT-1');
  });

  it('returns nothing without a group', () => {
    expect(planTimezoneFor(undefined, 'Asia/Saigon', winter)).toBeUndefined();
  });
});

describe('planTimezoneLabel', () => {
  it('shows a stored zone as its group label, including earlier plans', () => {
    expect(planTimezoneLabel('Antarctica/Davis')).toBe(indochina.text);
    expect(planTimezoneLabel('Asia/Saigon')).toBe(indochina.text);
  });

  it('keeps an unknown zone as stored and nothing for no zone', () => {
    expect(planTimezoneLabel('Mars/Olympus')).toBe('Mars/Olympus');
    expect(planTimezoneLabel(null)).toBeUndefined();
  });
});

describe('timezoneGroup', () => {
  it('resolves a zone listed in several groups by its current offset', () => {
    const listed = groups.filter((candidate) =>
      candidate.utc.includes('America/New_York')
    );
    expect(listed.length).toBeGreaterThan(1);
    const found = timezoneGroup('America/New_York', groups, winter);
    expect(found?.offset).toBe(zoneOffsetHours('America/New_York', winter));
  });

  it('prefers the group whose label names the zone city', () => {
    expect(timezoneGroup('Europe/Helsinki', groups, winter)?.text).toContain(
      'Helsinki'
    );
  });

  it('finds the single group a zone belongs to', () => {
    expect(timezoneGroup('Asia/Bangkok', groups, winter)?.text).toBe(
      indochina.text
    );
  });
});
