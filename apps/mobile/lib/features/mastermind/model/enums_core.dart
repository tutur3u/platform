enum EventKind {
  needsYou('needs_you'),
  decision('decision'),
  lane('lane'),
  backlog('backlog'),
  product('product'),
  quota('quota'),
  environment('environment'),
  receipt('receipt');

  const EventKind(this.wireName);
  final String wireName;
}

enum ReleaseProduct {
  tuturuuuWeb('Tuturuuu web'),
  tuturuuuContacts('Tuturuuu contacts'),
  tuturuuuCalendar('Tuturuuu calendar'),
  tuturuuuMobile('Tuturuuu mobile'),
  upskii('Upskii'),
  pktm('PKTM'),
  masteryAI('MasteryAI');

  const ReleaseProduct(this.wireName);
  final String wireName;
}

enum AgeBasis {
  githubDeployment('github_deployment'),
  vercelDeployment('vercel_deployment'),
  checkinWorkflow('checkin_workflow'),
  unknown('unknown');

  const AgeBasis(this.wireName);
  final String wireName;
}

enum Environment {
  production('production'),
  staging('staging');

  const Environment(this.wireName);
  final String wireName;
}

enum DeployStatus {
  success('success'),
  failure('failure'),
  error('error'),
  pending('pending'),
  queued('queued'),
  inProgress('in_progress'),
  inactive('inactive'),
  unknown('unknown');

  const DeployStatus(this.wireName);
  final String wireName;
}

enum CiState {
  success('success'),
  failure('failure'),
  pending('pending'),
  error('error'),
  unknown('unknown');

  const CiState(this.wireName);
  final String wireName;
}

enum Freshness {
  fresh('fresh'),
  cached('cached'),
  stale('stale'),
  unknown('unknown');

  const Freshness(this.wireName);
  final String wireName;
}

enum Evidence {
  githubDeployment('github_deployment'),
  vercelDeployment('vercel_deployment'),
  unknown('unknown');

  const Evidence(this.wireName);
  final String wireName;
}

enum LaneState {
  open('open'),
  answered('answered'),
  withdrawn('withdrawn'),
  stale('stale'),
  queued('queued'),
  running('running'),
  waiting('waiting'),
  idle('idle'),
  completed('completed'),
  failed('failed'),
  cancelled('cancelled'),
  unknown('unknown');

  const LaneState(this.wireName);
  final String wireName;
}

enum RepositoryName {
  tutur3uPlatform('tutur3u/platform'),
  upskiiPlatform('upskii/platform');

  const RepositoryName(this.wireName);
  final String wireName;
}

enum Coverage {
  ok('ok'),
  missing('missing'),
  partial('partial'),
  unavailable('unavailable'),
  stale('stale');

  const Coverage(this.wireName);
  final String wireName;
}

enum AccountDisplayName {
  soc('soc'),
  hehe('hehe'),
  skora('skora'),
  mira('mira'),
  kv('kv'),
  aiedu('aiedu'),
  skoraCodex('skora-codex');

  const AccountDisplayName(this.wireName);
  final String wireName;
}

enum Pacing {
  short('SHORT'),
  ok('OK'),
  surplus('SURPLUS');

  const Pacing(this.wireName);
  final String wireName;
}

enum CreditDisplayName {
  skoraCodex('skora-codex'),
  aiedu('aiedu');

  const CreditDisplayName(this.wireName);
  final String wireName;
}

enum ModelFamily {
  opus('Opus'),
  sonnet('Sonnet'),
  haiku('Haiku'),
  fable('Fable'),
  sol('sol'),
  terra('terra'),
  luna('luna'),
  astra('astra'),
  unknown('unknown');

  const ModelFamily(this.wireName);
  final String wireName;
}

enum RunRole {
  implementation('implementation'),
  review('review'),
  test('test'),
  design('design'),
  research('research'),
  unknown('unknown');

  const RunRole(this.wireName);
  final String wireName;
}
