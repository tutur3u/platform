import { expect, it } from 'vitest';
import {
  mergeMeetFormsPrefill,
  planMeetFormsPath,
  questionIssue,
} from './respondent-flow';
import type { MeetFormsDefinition, MeetFormsQuestion } from './types';

it('rejects a cyclic branch rather than silently submitting a partial response', () => {
  const form: MeetFormsDefinition = {
    id: 'form',
    launchId: 'launch',
    versionId: 'version',
    title: 'Survey',
    sections: [{ id: 'first', questions: [] }],
    logicRules: [
      {
        triggerType: 'section_end',
        sourceSectionId: 'first',
        actionType: 'go_to_section',
        targetSectionId: 'first',
      },
    ],
  };

  expect(planMeetFormsPath(form, {}).invalid).toBe(true);
});

it('requires a valid column for each required matrix row', () => {
  const matrix = {
    id: 'matrix',
    title: 'How was it?',
    type: 'matrix',
    required: true,
    rows: [
      { id: 'a', label: 'Pace' },
      { id: 'b', label: 'Content' },
    ],
    columns: [
      { id: 'good', label: 'Good' },
      { id: 'bad', label: 'Bad' },
    ],
  } satisfies MeetFormsQuestion;

  expect(questionIssue(matrix, { a: 'good' })).toBe('requiredError');
  expect(questionIssue(matrix, { a: 'good', b: 'unknown' })).toBe(
    'invalidError'
  );
  expect(questionIssue(matrix, { a: 'good', b: 'bad' })).toBeUndefined();
});

it('applies suggestions only to known text fields without an edited value', () => {
  const form: MeetFormsDefinition = {
    id: 'form',
    launchId: 'launch',
    versionId: 'version',
    title: 'Survey',
    sections: [
      {
        id: 'first',
        questions: [
          { id: 'name', title: 'Name', type: 'short_text' },
          { id: 'email', title: 'Email', type: 'email' },
          { id: 'department', title: 'Department', type: 'dropdown' },
        ],
      },
    ],
  };

  expect(
    mergeMeetFormsPrefill(
      form,
      { name: '' },
      {
        name: 'Sample person',
        email: 'sample@example.invalid',
        department: 'account details',
        unknown: 'not requested',
      }
    )
  ).toEqual({ name: '', email: 'sample@example.invalid' });
});

it('leaves answers to gated question types out of the planned response', () => {
  const form: MeetFormsDefinition = {
    id: 'form',
    launchId: 'launch',
    versionId: 'version',
    title: 'Survey',
    sections: [
      {
        id: 'first',
        questions: [
          { id: 'name', title: 'Name', type: 'short_text' },
          {
            id: 'grid',
            title: 'Grid',
            type: 'matrix',
            rows: [{ id: 'a', label: 'Pace' }],
            columns: [{ id: 'good', label: 'Good' }],
          },
          { id: 'file', title: 'File', type: 'file_upload' },
        ],
      },
    ],
  };
  const answers = { name: 'Avery', grid: { a: 'good' }, file: ['ref'] };

  expect(planMeetFormsPath(form, answers).answers).toEqual({ name: 'Avery' });
  expect(
    planMeetFormsPath(form, answers, { matrix: true, uploads: true }).answers
  ).toEqual(answers);
});
