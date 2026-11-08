import 'mastermind_home_fixture.dart';

/// One synthetic environment row. A null `sha`, `versionTag` or
/// `commitSubject` is sent as null, the publisher's way of saying it has none.
Map<String, dynamic> shipEnv(
  String product, {
  String environment = 'production',
  String deploy = 'success',
  String ci = 'success',
  String freshness = 'fresh',
  String? versionTag = 'v1.2.3',
  String? sha = 'abcdef1',
  String? subject = 'fix · ci',
  String evidence = 'github_deployment',
}) => {
  'product': product,
  'environment': environment,
  'released_at': '2026-01-31T10:00:00+00:00',
  'age_seconds': 7200,
  'version_tag': versionTag,
  'sha': sha,
  'commit_subject': subject,
  'deploy_status': deploy,
  'ci_state': ci,
  'observed_at': '2026-01-31T17:00:00+00:00',
  'freshness': freshness,
  'evidence': evidence,
};

Map<String, dynamic> shipRelease(String product, {int? ageSeconds = 86400}) => {
  'product': product,
  'prod_age_seconds': ageSeconds,
  'age_basis': 'github_deployment',
};

Map<String, dynamic> shipCi(String repo, {int? queued = 2, int? running = 1}) =>
    {
      'repo': repo,
      'queued': queued,
      'running': running,
      't': '2026-01-31T17:30:00+00:00',
    };

Map<String, dynamic> shipCadence(String product, String? lastProdAt) => {
  'product': product,
  'last_prod_at': lastProdAt,
};

/// A synthetic export whose Ship sources are exactly the arguments, with a
/// security row in the sections that carry one so redaction is exercised.
Map<String, dynamic> shipJson({
  List<Map<String, dynamic>> environments = const [],
  List<Map<String, dynamic>> releases = const [],
  List<Map<String, dynamic>> ci = const [],
  List<Map<String, dynamic>> cadence = const [],
  Map<String, dynamic>? delivery,
}) {
  final root = homeJson(needsYou: false);
  root['environments'] = environments;
  (root['products'] as Map<String, dynamic>)['releases'] = releases;
  final obs = root['observability'] as Map<String, dynamic>;
  obs['ci'] = ci;
  obs['cadence'] = cadence;
  if (delivery != null) obs['delivery'] = delivery;
  return root;
}

Map<String, dynamic> deliveryJson({
  String coverage = 'ok',
  List<Map<String, dynamic>> ships = const [],
  List<Map<String, dynamic>> mergeToLive = const [],
  List<Map<String, dynamic>> openPrs = const [],
}) => {
  'coverage': coverage,
  'ships': ships,
  'merge_to_live': mergeToLive,
  'ci': <Map<String, dynamic>>[],
  'open_prs': openPrs,
};
