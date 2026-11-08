import 'mastermind_home_fixture.dart';

Map<String, dynamic> _window(
  double? remaining, {
  String? pacing = 'OK',
  double? burn = 4.2,
  double? projected = 12,
  String? resetsAt = '2026-01-31T11:00:00+00:00',
}) => {
  'remaining_percent': remaining,
  'resets_at': resetsAt,
  'burn_percent_per_hour': burn,
  'projected_remaining_at_reset': projected,
  'pacing': pacing,
};

/// One usage reading for a pool. [t] defaults to the snapshot time.
Map<String, dynamic> usagePoint(
  String label, {
  String t = '2026-01-31T17:30:00+00:00',
  double? session = 60,
  double? weekly = 40,
  String? sessionPacing = 'OK',
  String? weeklyPacing = 'OK',
  double? burn = 4.2,
  double? projected = 12,
  String? resetsAt = '2026-01-31T11:00:00+00:00',
}) => {
  'instance': label,
  't': t,
  'session': _window(
    session,
    pacing: sessionPacing,
    burn: burn,
    projected: projected,
    resetsAt: resetsAt,
  ),
  'weekly': _window(weekly, pacing: weeklyPacing, resetsAt: resetsAt),
};

Map<String, dynamic> creditPoint(
  String label, {
  String t = '2026-01-31T17:30:00+00:00',
  double? remaining = 120,
  double? burn = 10,
  double? target = 12,
}) => {
  'instance': label,
  't': t,
  'remaining': remaining,
  'daily_burn': burn,
  'daily_target': target,
  'burn_vs_target': burn == null || target == null ? null : burn - target,
};

/// A synthetic export whose usage sources are exactly the arguments.
Map<String, dynamic> usageJson({
  String coverage = 'ok',
  List<Map<String, dynamic>> instances = const [],
  List<Map<String, dynamic>> series = const [],
  List<Map<String, dynamic>> credits = const [],
  List<Map<String, dynamic>> quotas = const [],
  List<Map<String, dynamic>> forecasts = const [],
}) {
  final root = homeJson(needsYou: false);
  (root['products'] as Map<String, dynamic>)['quotas'] = quotas;
  final obs = root['observability'] as Map<String, dynamic>;
  obs['quota_forecasts'] = forecasts;
  obs['usage'] = {
    'coverage': coverage,
    'instances': instances,
    'series': series,
    'credits': credits,
  };
  return root;
}

String _iso(DateTime value) =>
    value.toUtc().toIso8601String().replaceFirst('.000Z', '+00:00');

/// Readings 15 minutes apart ending at the snapshot time, so a pool has a
/// line to draw.
List<Map<String, dynamic>> usageSeries(
  String label, {
  List<double?> session = const [80, 70, 60],
  List<double?> weekly = const [50, 45, 40],
}) {
  final last = DateTime.utc(2026, 1, 31, 17, 30);
  return [
    for (var i = 0; i < session.length; i++)
      usagePoint(
        label,
        t: _iso(
          last.subtract(Duration(minutes: 15 * (session.length - 1 - i))),
        ),
        session: session[i],
        weekly: weekly[i],
      ),
  ];
}
