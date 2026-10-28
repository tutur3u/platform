import 'mastermind_home_fixture.dart';

String laneId(int n) => 'item-${n.toRadixString(16).padLeft(20, '0')}';

/// One synthetic lane. A null [ageSeconds] or [etaSeconds] is sent as null,
/// the publisher's way of saying it does not know.
Map<String, dynamic> workLane(
  int n, {
  String state = 'running',
  String? title,
  String role = 'Lead',
  String providerModel = 'claude / claude-opus-4-1',
  int? ageSeconds = 7200,
  int? etaSeconds,
  String? product = 'Tuturuuu',
  String? area,
  String? kind,
}) => {
  'id': laneId(n),
  'title': title ?? 'Lane $n',
  'role': role,
  'state': state,
  'provider_model': providerModel,
  'age_seconds': ageSeconds,
  'eta_seconds': etaSeconds,
  'product': ?product,
  'area': ?area,
  'kind': ?kind,
};

/// One synthetic backlog item. The id is an opaque `item-<20 hex>` like a
/// lane's.
Map<String, dynamic> backlogRow(
  int n, {
  String state = 'open',
  String? title,
  String? product = 'Tuturuuu',
}) => {
  'id': laneId(n),
  'title': title ?? 'Backlog $n',
  'state': state,
  'product': ?product,
};

/// One synthetic staff role: the four fields schema 1.4 publishes.
Map<String, dynamic> staffRow(
  String role, {
  String state = 'running',
  String? title,
  String model = 'claude / claude-opus-4-1',
}) => {
  'role': role,
  'title': title ?? '$role title',
  'state': state,
  'model': model,
};

const _securityRow = <String, dynamic>{
  'title': 'Security issue',
  'state': 'running',
  'product': 'Mastermind',
};

/// A synthetic export whose `lanes` is exactly [lanes] and whose `backlog` is
/// exactly [backlog] (each plus one security row when [security]). [staff]
/// replaces `observability.staff` when given.
Map<String, dynamic> workJson(
  List<Map<String, dynamic>> lanes, {
  bool security = true,
  List<Map<String, dynamic>> backlog = const [],
  List<Map<String, dynamic>>? staff,
}) {
  final root = homeJson(needsYou: false, security: false);
  root['lanes'] = [...lanes, if (security) _securityRow];
  root['backlog'] = [...backlog, if (security) _securityRow];
  if (staff != null) {
    (root['observability'] as Map<String, dynamic>)['staff'] = staff;
  }
  return root;
}
