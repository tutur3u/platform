import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';

/// Synthetic values from the public schema, never from a local snapshot.
final class MastermindSnapshotBuilder {
  MastermindSnapshotBuilder.defaults({this.seed = 23});

  final int seed;

  final Map<String, String> coverage = {};
  bool nullRuns = false;
  bool gaps = false;
  bool downsampled = false;
  bool partialLastBucket = false;
  bool stale = false;
  bool cursorGap = false;
  bool securityVariants = false;
  bool emptyCoordination = false;
  bool nearCap = false;

  Map<String, dynamic> toJson() {
    final root = jsonDecode(_syntheticDefault) as Map<String, dynamic>;
    final obs = root['observability'] as Map<String, dynamic>;
    for (final entry in coverage.entries) {
      (obs[entry.key] as Map<String, dynamic>)['coverage'] = entry.value;
    }
    final now = root['now'] as Map<String, dynamic>;
    now['cursor_gap'] = cursorGap;
    if (stale) root['generated_at'] = '2025-01-01T00:00:00+00:00';
    final usage = obs['usage'] as Map<String, dynamic>;
    final series = usage['series'] as List<dynamic>;
    for (var i = 0; i < series.length; i++) {
      final row = jsonDecode(jsonEncode(series[i])) as Map<String, dynamic>;
      if (gaps || downsampled) {
        final minutes = i * (downsampled ? 60 : 15) + (gaps && i > 1 ? 45 : 0);
        row['t'] = _timestamp(
          DateTime.utc(2026, 1, 31, 16).add(Duration(minutes: minutes)),
        );
      }
      if (nullRuns && (i == 1 || i == 2)) {
        for (final window in ['session', 'weekly']) {
          final values = row[window] as Map<String, dynamic>;
          for (final key in values.keys.toList()) {
            values[key] = null;
          }
        }
      }
      series[i] = row;
    }
    if (partialLastBucket) {
      usage['coverage'] = 'partial';
      (series.last as Map<String, dynamic>)['t'] = '2026-01-31T17:30:00+00:00';
    }
    if (emptyCoordination) {
      final coordination = obs['coordination'] as Map<String, dynamic>;
      coordination['coverage'] = 'unavailable';
      for (final field in ['messages', 'latency', 'queue', 'failures']) {
        coordination[field] = <dynamic>[];
      }
    }
    if (securityVariants) {
      final security = <String, dynamic>{
        'title': 'Security issue',
        'severity': 'high',
        'state': 'open',
        'product': 'Mastermind',
      };
      (now['needs_you'] as List<dynamic>).add({...security});
      (root['lanes'] as List<dynamic>).add({...security});
      (root['backlog'] as List<dynamic>).add({...security});
      (root['decisions'] as List<dynamic>).add({
        'id': 'd_00000000000f',
        'at': '2026-01-31T17:30:00+00:00',
        'title': 'Security fix',
        'area': 'security',
        'risk': 'high',
      });
    }
    final random = Random(seed);
    final ids = <String, String>{};
    void seedIds(Object? value) {
      if (value is Map<String, dynamic>) {
        for (final key in value.keys.toList()) {
          if (key == 'id') {
            final original = value[key] as String;
            value[key] = ids.putIfAbsent(original, () {
              final count = original.startsWith('item-') ? 10 : 6;
              final hex = List.generate(
                count,
                (_) => random.nextInt(256).toRadixString(16).padLeft(2, '0'),
              ).join();
              return '${count == 10 ? 'item-' : 'd_'}$hex';
            });
          } else {
            seedIds(value[key]);
          }
        }
      } else if (value is List) {
        value.forEach(seedIds);
      }
    }

    seedIds(root);
    return root;
  }

  Uint8List bytes() {
    final encoded = utf8.encode(jsonEncode(toJson()));
    // JSON whitespace approaches the cap without inventing invalid records.
    return Uint8List.fromList(
      nearCap
          ? [...encoded, ...List<int>.filled(599999 - encoded.length, 32)]
          : encoded,
    );
  }

  static String _timestamp(DateTime value) =>
      value.toIso8601String().replaceFirst('.000Z', '+00:00');
}

final String _syntheticDefault = const <String>[
  '{"schema_version":"1.3","generated_at":"2026-01-31T17:30:00+00:00',
  '","now":{"after_seq":0,"latest_seq":1,"cursor_gap":false,"digest"',
  ':[{"seq":1,"ts":"2026-01-31T17:30:00+00:00","kind":"needs_you","p',
  'ayload":{"id":"item-00000000000000000001","title":"Synthetic titl',
  'e","body":"Synthetic body","options":["Synthetic option"],"recomm',
  'ended_option":"Synthetic recommended_option","state":"open","vers',
  'ion_hash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  'aaaaaaaaaa","kind":"decision","severity":"low","product":"Tuturuu',
  'u"}}],"needs_you":[{"id":"item-00000000000000000001","title":"Syn',
  'thetic title","body":"Synthetic body","options":["Synthetic optio',
  'n"],"recommended_option":"Synthetic recommended_option","state":"',
  'open","version_hash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  'aaaaaaaaaaaaaaaaaaaaa","kind":"decision","severity":"low","produc',
  't":"Tuturuuu"}]},"lanes":[{"id":"item-00000000000000000002","titl',
  'e":"Synthetic title","role":"Synthetic role","state":"open","prov',
  'ider_model":"Synthetic provider_model","age_seconds":1,"eta_secon',
  'ds":1,"product":"Tuturuuu","area":"finance","kind":"implementatio',
  'n"}],"backlog":[{"id":"item-00000000000000000003","title":"Synthe',
  'tic title","state":"open","product":"Tuturuuu"}],"products":{"rel',
  'eases":[{"product":"Tuturuuu web","prod_age_seconds":1,"age_basis',
  '":"github_deployment"}],"quotas":[{"instance":"fixture_account","',
  'remaining_percent":1,"age_seconds":1}]},"environments":[{"product',
  '":"Tuturuuu web","environment":"production","released_at":"2026-0',
  '1-31T17:30:00+00:00","age_seconds":1,"version_tag":"Synthetic ver',
  'sion_tag","sha":"abcdef1","commit_subject":"Synthetic commit_subj',
  'ect","deploy_status":"success","ci_state":"success","observed_at"',
  ':"2026-01-31T17:30:00+00:00","freshness":"fresh","evidence":"gith',
  'ub_deployment"}],"decisions":[{"id":"d_000000000004","at":"2026-0',
  '1-31T17:30:00+00:00","title":"Synthetic title","area":"finance","',
  'risk":"low","by":"role:synthetic","category":"auto","why":"Synthe',
  'tic why","reversible":false,"product":"Tuturuuu"}],"decisions_ski',
  'pped":1,"observability":{"quota_series":[{"instance":"fixture_acc',
  'ount","t":"2026-01-31T17:30:00+00:00","pct":1}],"quota_forecasts"',
  ':[{"instance":"fixture_account","projected_empty_at":"2026-01-31T',
  '17:30:00+00:00","resets_at":"2026-01-31T17:30:00+00:00"}],"speed_',
  'series":[{"model":"Synthetic model","t":"2026-01-31T17:30:00+00:0',
  '0","tok_s_p50":1}],"children_series":[{"t":"2026-01-31T17:30:00+0',
  '0:00","provider":"Synthetic provider","model":"Synthetic model","',
  'running":1,"started":1,"finished":1}],"staff":[{"role":"Synthetic',
  ' role","title":"Synthetic title","state":"open","last_active":"20',
  '26-01-31T17:30:00+00:00","model":"Synthetic model","runs_today":1',
  '}],"ci":[{"repo":"tutur3u/platform","queued":1,"running":1,"t":"2',
  '026-01-31T17:30:00+00:00"}],"cadence":[{"product":"Tuturuuu web",',
  '"last_prod_at":"2026-01-31T17:30:00+00:00"}],"usage":{"coverage":',
  '"ok","instances":[{"instance":"fixture_account","display_name":"s',
  'oc","t":"2026-01-31T17:30:00+00:00","session":{"remaining_percent',
  '":1,"resets_at":"2026-01-31T17:30:00+00:00","burn_percent_per_hou',
  'r":1,"projected_remaining_at_reset":1,"pacing":"SHORT"},"weekly":',
  '{"remaining_percent":null,"resets_at":"2026-01-31T17:30:00+00:00"',
  ',"burn_percent_per_hour":1,"projected_remaining_at_reset":1,"paci',
  'ng":"SHORT"}}],"series":[{"instance":"fixture_account","display_n',
  'ame":"soc","t":"2026-01-31T16:45:00+00:00","session":{"remaining_',
  'percent":1,"resets_at":"2026-01-31T17:30:00+00:00","burn_percent_',
  'per_hour":1,"projected_remaining_at_reset":1,"pacing":"SHORT"},"w',
  'eekly":{"remaining_percent":1,"resets_at":"2026-01-31T17:30:00+00',
  ':00","burn_percent_per_hour":1,"projected_remaining_at_reset":1,"',
  'pacing":"SHORT"}},{"instance":"fixture_account","display_name":"s',
  'oc","t":"2026-01-31T17:00:00+00:00","session":{"remaining_percent',
  '":1,"resets_at":"2026-01-31T17:30:00+00:00","burn_percent_per_hou',
  'r":1,"projected_remaining_at_reset":1,"pacing":"SHORT"},"weekly":',
  '{"remaining_percent":1,"resets_at":"2026-01-31T17:30:00+00:00","b',
  'urn_percent_per_hour":1,"projected_remaining_at_reset":1,"pacing"',
  ':"SHORT"}},{"instance":"fixture_account","display_name":"soc","t"',
  ':"2026-01-31T17:15:00+00:00","session":{"remaining_percent":1,"re',
  'sets_at":"2026-01-31T17:30:00+00:00","burn_percent_per_hour":1,"p',
  'rojected_remaining_at_reset":1,"pacing":"SHORT"},"weekly":{"remai',
  'ning_percent":1,"resets_at":"2026-01-31T17:30:00+00:00","burn_per',
  'cent_per_hour":1,"projected_remaining_at_reset":1,"pacing":"SHORT',
  '"}},{"instance":"fixture_account","display_name":"soc","t":"2026-',
  '01-31T17:30:00+00:00","session":{"remaining_percent":1,"resets_at',
  '":"2026-01-31T17:30:00+00:00","burn_percent_per_hour":1,"projecte',
  'd_remaining_at_reset":1,"pacing":"SHORT"},"weekly":{"remaining_pe',
  'rcent":1,"resets_at":"2026-01-31T17:30:00+00:00","burn_percent_pe',
  'r_hour":1,"projected_remaining_at_reset":1,"pacing":"SHORT"}}],"c',
  'redits":[{"instance":"fixture_account","display_name":"skora-code',
  'x","t":"2026-01-31T17:30:00+00:00","remaining":1,"daily_burn":1,"',
  'daily_target":1,"burn_vs_target":1}]},"models":{"coverage":"parti',
  'al","observed_at":"2026-01-31T17:30:00+00:00","breakdown":[{"mode',
  'l":"Opus","role":"implementation","effort":"none","runs":1,"activ',
  'e":1,"completed":1,"terminal":1,"success":1,"rework":1,"success_r',
  'ate":1,"rework_rate":1,"median_duration_seconds":1,"tokens_per_su',
  'ccess":1,"session_percent_per_success":1,"tokens_measured_runs":1',
  ',"session_measured_runs":1,"success_rate_change_7d":1,"tentative"',
  ':true}],"series":[{"t":"2026-01-31T17:30:00+00:00","model":"Opus"',
  ',"role":"implementation","effort":"none","runs":1,"active":1,"com',
  'pleted":1,"terminal":1,"success":1,"rework":1,"success_rate":1,"r',
  'ework_rate":1,"median_duration_seconds":1,"tokens_per_success":1,',
  '"session_percent_per_success":1,"tokens_measured_runs":1,"session',
  '_measured_runs":1,"success_rate_change_7d":1,"tentative":false}]}',
  ',"fleet":{"coverage":"ok","counts":[{"role":"Lead","top_level":1,',
  '"depth_1":1,"depth_2_plus":1}],"series":[{"t":"2026-01-31T17:30:0',
  '0+00:00","running":1,"waiting":1,"idle":1,"unknown":1}],"tree":[{',
  '"label":"Lead","product":"Tuturuuu","threads":1,"children":1,"gra',
  'ndchildren":1}]},"coordination":{"coverage":"ok","messages":[{"t"',
  ':"2026-01-31T17:30:00+00:00","sender_role":"Lead","receiver_role"',
  ':"Lead","count":1}],"latency":[{"t":"2026-01-31T17:30:00+00:00","',
  'median_seconds":1,"samples":1}],"queue":[{"t":"2026-01-31T17:30:0',
  '0+00:00","depth":1,"steer":null,"queue":1,"start":1}],"failures":',
  '[{"t":"2026-01-31T17:30:00+00:00","cause":"usage_limit","count":1',
  '}]},"delivery":{"coverage":"ok","ships":[{"t":"2026-01-31T17:30:0',
  '0+00:00","product":"Tuturuuu","count":1}],"merge_to_live":[{"t":"',
  '2026-01-31T17:30:00+00:00","product":"Tuturuuu","median_minutes":',
  '1,"samples":1}],"ci":[{"t":"2026-01-31T17:30:00+00:00","repo":"tu',
  'tur3u/platform","queued":1,"running":1}],"open_prs":[{"t":"2026-0',
  '1-31T17:30:00+00:00","product":"Tuturuuu","count":1}]},"security"',
  ':{"coverage":"ok","register":[{"product":"Tuturuuu","severity":"c',
  'ritical","status":"OPEN","count":1}],"series":[{"t":"2026-01-31T1',
  '7:30:00+00:00","product":"Tuturuuu","critical_open":1,"critical_c',
  'losed":1}],"time_to_fix":[{"t":"2026-01-31T17:30:00+00:00","produ',
  'ct":"Tuturuuu","median_hours":1,"samples":1}]}},"sources":[{"sour',
  'ce":"inbox","state":"ok"}]}',
].join();
