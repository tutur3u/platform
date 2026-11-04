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

/// Where an answered item was answered (schema 1.5 `answered_via`). Unknown
/// values parse to null rather than rejecting the row.
enum AnsweredVia {
  phone('phone'),
  mac('mac'),
  chat('chat'),
  auto('auto'),
  batch('batch');

  const AnsweredVia(this.wireName);
  final String wireName;

  static AnsweredVia? fromWire(Object? value) {
    for (final via in values) {
      if (via.wireName == value) return via;
    }
    return null;
  }
}

enum ItemKind {
  decision('decision'),
  action('action'),
  fyi('fyi');

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
