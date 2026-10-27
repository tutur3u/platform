enum Effort {
  none('none'),
  minimal('minimal'),
  low('low'),
  medium('medium'),
  high('high'),
  xhigh('xhigh'),
  max('max'),
  ultra('ultra'),
  unknown('unknown');

  const Effort(this.wireName);
  final String wireName;
}

enum Role {
  lead('Lead'),
  product('Product'),
  ops('Ops'),
  watch('Watch'),
  user('User');

  const Role(this.wireName);
  final String wireName;
}

enum Product {
  tuturuuu('Tuturuuu'),
  upskii('Upskii'),
  pktm('PKTM'),
  masteryAI('MasteryAI'),
  mira('Mira'),
  exocorpse('Exocorpse'),
  mastermind('Mastermind');

  const Product(this.wireName);
  final String wireName;
}

enum FailureCause {
  usageLimit('usage_limit'),
  capacity('capacity'),
  error('error');

  const FailureCause(this.wireName);
  final String wireName;
}

enum Severity {
  critical('critical'),
  high('high'),
  medium('medium'),
  low('low'),
  unknown('unknown');

  const Severity(this.wireName);
  final String wireName;
}

enum RegisterStatus {
  open('OPEN'),
  assigned('ASSIGNED'),
  inFix('IN-FIX'),
  inReview('IN-REVIEW'),
  approved('APPROVED'),
  revise('REVISE'),
  staging('STAGING'),
  shipped('SHIPPED'),
  verified('VERIFIED'),
  refuted('REFUTED'),
  acceptedRisk('ACCEPTED-RISK');

  const RegisterStatus(this.wireName);
  final String wireName;
}

enum SourceName {
  inbox('inbox'),
  openItems('open_items'),
  directory('directory'),
  t3('t3'),
  ledger('ledger'),
  checkin('checkin'),
  github('github'),
  quotaCache('quota_cache'),
  quotaWatcher('quota_watcher'),
  decisions('decisions'),
  speed('speed'),
  workforce('workforce'),
  ci('ci');

  const SourceName(this.wireName);
  final String wireName;
}

enum SourceState {
  ok('ok'),
  missing('missing'),
  unavailable('unavailable'),
  stale('stale');

  const SourceState(this.wireName);
  final String wireName;
}

enum ItemState {
  open('open'),
  answered('answered'),
  withdrawn('withdrawn');

  const ItemState(this.wireName);
  final String wireName;
}

enum ItemKind {
  decision('decision'),
  action('action'),
  fyi('fyi'),
  security('security');

  const ItemKind(this.wireName);
  final String wireName;
}

enum Area {
  finance('finance'),
  users('users'),
  tasks('tasks'),
  education('education'),
  infra('infra'),
  ux('ux'),
  perf('perf'),
  ci('ci'),
  release('release'),
  quota('quota'),
  memory('memory'),
  hub('hub');

  const Area(this.wireName);
  final String wireName;
}

enum LaneKind {
  implementation('implementation'),
  review('review'),
  test('test'),
  design('design'),
  research('research'),
  decision('decision'),
  lane('lane'),
  backlog('backlog'),
  action('action'),
  fyi('fyi'),
  staff('staff');

  const LaneKind(this.wireName);
  final String wireName;
}

enum ReceiptProduct {
  tuturuuuWeb('Tuturuuu web'),
  tuturuuuContacts('Tuturuuu contacts'),
  tuturuuuCalendar('Tuturuuu calendar'),
  tuturuuuMobile('Tuturuuu mobile'),
  upskii('Upskii'),
  pktm('PKTM'),
  masteryAI('MasteryAI'),
  unknown('unknown');

  const ReceiptProduct(this.wireName);
  final String wireName;
}

enum ReceiptState {
  completed('completed'),
  failed('failed'),
  waiting('waiting');

  const ReceiptState(this.wireName);
  final String wireName;
}

enum DecisionArea {
  finance('finance'),
  users('users'),
  tasks('tasks'),
  education('education'),
  infra('infra'),
  ux('ux'),
  perf('perf'),
  ci('ci'),
  release('release'),
  quota('quota'),
  memory('memory'),
  hub('hub'),
  product('product'),
  org('org'),
  cost('cost');

  const DecisionArea(this.wireName);
  final String wireName;
}

enum Risk {
  low('low'),
  med('med'),
  high('high');

  const Risk(this.wireName);
  final String wireName;
}

enum DecisionCategory {
  auto('auto'),
  delegated('delegated'),
  user('user');

  const DecisionCategory(this.wireName);
  final String wireName;
}
