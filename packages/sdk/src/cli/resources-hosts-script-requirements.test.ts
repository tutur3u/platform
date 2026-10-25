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
  it('P3: test path arguments do not imply Flutter', () => {
    expect(
      hostsRequirements('bun', ['run', 'test', '--', 'src/mobile-nav.test.ts'])
    ).toEqual([]);
    expect(
      hostsRequirements(
        'bun',
        ['run', 'test', '--', 'src/mobile-nav.test.ts'],
        ['--host', 'auto', '--requires', 'web']
      )
    ).toEqual(['web']);
  });
  it('P3: the mobile API mapping checker is not a Flutter script', () => {
    expect(hostsRequirements('bun', ['check:mobile-api-mappings'])).toEqual([]);
  });
  it.each([['build'], ['run', 'build']])(
    'P3: bare and run heavy scripts both fail closed: %j',
    (...args) => {
      expect(() => hostsRequirements('bun', args, ['--host', 'auto'])).toThrow(
        '--requires'
      );
    }
  );
});
