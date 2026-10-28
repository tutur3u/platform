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

const _securityRow = <String, dynamic>{
  'title': 'Security issue',
  'state': 'running',
  'product': 'Mastermind',
};

/// A synthetic export whose `lanes` is exactly [lanes] (plus one security row
/// when [security]).
Map<String, dynamic> workJson(
  List<Map<String, dynamic>> lanes, {
  bool security = true,
}) {
  final root = homeJson(needsYou: false, security: false);
  root['lanes'] = [...lanes, if (security) _securityRow];
  return root;
}
