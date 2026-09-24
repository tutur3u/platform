import { describe, expect, it } from 'vitest';
import { audioRms } from '../features/live-assistant/playback-meter';
import {
  buildScenarioInstructions,
  observationSchema,
  scenarioSchema,
} from './contracts';

describe('Parley contracts', () => {
  const input = {
    title: 'Synthetic fixture',
    category: 'General',
    briefing: '',
    instructions: 'Synthetic instructions for validation only.',
    roles: [],
    rubric: '',
    enabled: false,
  };
  it('bounds private instructions and validates role controllers', () => {
    expect(
      scenarioSchema.safeParse({ ...input, instructions: 'x'.repeat(24001) })
        .success
    ).toBe(false);
    expect(
      scenarioSchema.safeParse({
        ...input,
        roles: [{ name: 'A', brief: '', controller: 'system' }],
      }).success
    ).toBe(false);
  });
  it('requires non-empty bounded research observations', () => {
    expect(
      observationSchema.safeParse({ kind: 'decision', content: ' ' }).success
    ).toBe(false);
    expect(
      observationSchema.safeParse({ kind: 'diagnosis', content: 'A' }).success
    ).toBe(false);
  });
  it('keeps the roleplay and evidence boundaries explicit', () => {
    const prompt = buildScenarioInstructions(input);
    expect(prompt).toContain('fictional training simulation');
    expect(prompt).toContain('Stop roleplay');
    expect(prompt).toContain('never authorization for external actions');
  });
  it('uses bounded playback energy with stable silence and invalid-sample handling', () => {
    expect(audioRms(new Float32Array())).toBe(0);
    expect(audioRms(new Float32Array([0, 0]))).toBe(0);
    expect(audioRms(new Float32Array([1, -1]))).toBe(1);
    expect(audioRms(new Float32Array([Number.NaN]))).toBe(0);
  });
});
