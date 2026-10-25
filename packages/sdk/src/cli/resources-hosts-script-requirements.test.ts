import { afterEach, describe, expect, it, vi } from 'vitest';
import { hostsRequirements } from './resources-hosts-requirements';

afterEach(() => vi.restoreAllMocks());
describe('review: repo wrapper capabilities', () => {
  it.each([
    ['bun', ['sb:reset']],
    ['bun', ['run', 'sb:start']],
    ['pnpm', ['run', 'sb:up']],
  ])('P2: %s %j requires Supabase and Docker', (command, args) => {
    expect(hostsRequirements(command, args)).toEqual(['docker', 'supabase']);
  });
  it.each([
    ['bun', ['run', 'flutter-test']],
    ['bun', ['run', 'check:mobile']],
    ['bun', ['build:android']],
    ['dart', ['run', 'melos', 'test']],
    ['melos', ['run', 'test']],
    ['bun', ['--cwd', 'apps/mobile', 'run', 'test']],
  ])('P2: %s %j requires Flutter', (command, args) => {
    expect(hostsRequirements(command, args)).toContain('flutter');
  });
  it('P2: mobile scripts keep Apple platform requirements', () => {
    expect(hostsRequirements('bun', ['run', 'build:ios:ipa'])).toEqual([
      'flutter',
      'ios',
    ]);
    vi.spyOn(process, 'cwd').mockReturnValue('/repo/apps/mobile');
    expect(hostsRequirements('bun', ['run', 'test'])).toContain('flutter');
  });
  it('P2: ambiguous known heavy scripts need an explicit requirement for auto placement', () => {
    expect(() =>
      hostsRequirements('bun', ['run', 'build'], ['--host', 'auto'])
    ).toThrow('--requires');
    expect(
      hostsRequirements(
        'bun',
        ['run', 'build'],
        ['--host', 'auto', '--requires', 'web']
      )
    ).toEqual(['web']);
  });
});
