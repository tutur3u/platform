import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';

import 'package:mobile/features/mastermind/parse/snapshot_parser.dart';

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
        'state': 'open',
        'product': 'Mastermind',
      };
      (now['needs_you'] as List<dynamic>).add({...security});
      (root['lanes'] as List<dynamic>).add({...security});
      (root['backlog'] as List<dynamic>).add({...security});
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
          ? [
              ...encoded,
              ...List<int>.filled(
                mastermindSnapshotMaxBytes - 1 - encoded.length,
                32,
              ),
            ]
          : encoded,
    );
  }

  static String _timestamp(DateTime value) =>
      value.toIso8601String().replaceFirst('.000Z', '+00:00');
}

final String _syntheticDefault = const <String>[
  '{"schema_version":"1.4","generated_at":"2026-01-31T17:30:00+00:00"',
  ',"now":{"after_seq":0,"latest_seq":1,"cursor_gap":false,"digest":[',
  '{"seq":1,"ts":"2026-01-31T17:30:00+00:00","kind":"needs_you","payl',
  'oad":{"id":"item-00000000000000000001","title":"Synthetic title","',
  'body":"Synthetic body","options":["Synthetic option"],"recommended',
  '_option":"Synthetic recommended_option","state":"open","version_ha',
  'sh":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  'aaa","kind":"decision","product":"Tuturuuu"}}],"needs_you":[{"id":',
  '"item-00000000000000000001","title":"Synthetic title","body":"Synt',
  'hetic body","options":["Synthetic option"],"recommended_option":"S',
  'ynthetic recommended_option","state":"open","version_hash":"aaaaaa',
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","kind"',
  ':"decision","product":"Tuturuuu"}]},"lanes":[{"id":"item-000000000',
  '00000000002","title":"Synthetic title","role":"Synthetic role","st',
  'ate":"open","provider_model":"claude / claude-opus-4-1","age_secon',
  'ds":1,"eta_seconds":1,"product":"Tuturuuu","area":"finance","kind"',
  ':"implementation"}],"backlog":[{"id":"item-00000000000000000003","',
  'title":"Synthetic title","state":"open","product":"Tuturuuu"}],"pr',
  'oducts":{"releases":[{"product":"Tuturuuu web","prod_age_seconds":',
  '1,"age_basis":"github_deployment"}],"quotas":[{"instance":"Claude ',
  'pool A","remaining_percent":1,"age_seconds":1}]},"environments":[{',
  '"product":"Tuturuuu web","environment":"production","released_at":',
  '"2026-01-31T17:30:00+00:00","age_seconds":1,"version_tag":"v1.2.3",',
  '"sha":"abcdef1","commit_subject":"fix \u00b7 ci","deploy_status":"succ',
  'ess","ci_state":"success","observed',
  '_at":"2026-01-31T17:30:00+00:00","freshness":"fresh","evidence":"g',
  'ithub_deployment"}],"decisions":[{"id":"d_000000000004","at":"2026',
  '-01-31T17:30:00+00:00","title":"Synthetic title","area":"finance",',
  '"risk":"low","by":"role:synthetic","category":"auto","why":"Synthe',
  'tic why","reversible":false,"product":"Tuturuuu"}],"decisions_skip',
  'ped":1,"observability":{"quota_series":[{"instance":"Claude pool A',
  '","t":"2026-01-31T17:30:00+00:00","pct":1}],"quota_forecasts":[{"i',
  'nstance":"Claude pool A","projected_empty_at":"2026-01-31T17:30:00',
  '+00:00","resets_at":"2026-01-31T17:30:00+00:00"}],"speed_series":[',
  '{"model":"claude-opus-4-1","t":"2026-01-31T17:30:00+00:00","tok_s_',
  'p50":1}],"children_series":[{"t":"2026-01-31T17:30:00+00:00","prov',
  'ider":"claude","model":"claude-opus-4-1","running":1,"started":1,"',
  'finished":1}],"staff":[{"role":"Synthetic role","title":"Synthetic',
  ' title","state":"open","model":"claude-opus-4-1"}],"ci":[{"repo":"',
  'tutur3u/platform","queued":1,"running":1,"t":"2026-01-31T17:30:00+',
  '00:00"}],"cadence":[{"product":"Tuturuuu web","last_prod_at":"2026',
  '-01-31T17:30:00+00:00"}],"usage":{"coverage":"ok","instances":[{"i',
  'nstance":"Claude pool A","t":"2026-01-31T17:30:00+00:00","session"',
  ':{"remaining_percent":1,"resets_at":"2026-01-31T17:30:00+00:00","b',
  'urn_percent_per_hour":1,"projected_remaining_at_reset":1,"pacing":',
  '"SHORT"},"weekly":{"remaining_percent":null,"resets_at":"2026-01-3',
  '1T17:30:00+00:00","burn_percent_per_hour":1,"projected_remaining_a',
  't_reset":1,"pacing":"SHORT"}}],"series":[{"instance":"Claude pool ',
  'A","t":"2026-01-31T16:45:00+00:00","session":{"remaining_percent":',
  '1,"resets_at":"2026-01-31T17:30:00+00:00","burn_percent_per_hour":',
  '1,"projected_remaining_at_reset":1,"pacing":"SHORT"},"weekly":{"re',
  'maining_percent":1,"resets_at":"2026-01-31T17:30:00+00:00","burn_p',
  'ercent_per_hour":1,"projected_remaining_at_reset":1,"pacing":"SHOR',
  'T"}},{"instance":"Claude pool A","t":"2026-01-31T17:00:00+00:00","',
  'session":{"remaining_percent":1,"resets_at":"2026-01-31T17:30:00+0',
  '0:00","burn_percent_per_hour":1,"projected_remaining_at_reset":1,"',
  'pacing":"SHORT"},"weekly":{"remaining_percent":1,"resets_at":"2026',
  '-01-31T17:30:00+00:00","burn_percent_per_hour":1,"projected_remain',
  'ing_at_reset":1,"pacing":"SHORT"}},{"instance":"Claude pool A","t"',
  ':"2026-01-31T17:15:00+00:00","session":{"remaining_percent":1,"res',
  'ets_at":"2026-01-31T17:30:00+00:00","burn_percent_per_hour":1,"pro',
  'jected_remaining_at_reset":1,"pacing":"SHORT"},"weekly":{"remainin',
  'g_percent":1,"resets_at":"2026-01-31T17:30:00+00:00","burn_percent',
  '_per_hour":1,"projected_remaining_at_reset":1,"pacing":"SHORT"}},{',
  '"instance":"Claude pool A","t":"2026-01-31T17:30:00+00:00","sessio',
  'n":{"remaining_percent":1,"resets_at":"2026-01-31T17:30:00+00:00",',
  '"burn_percent_per_hour":1,"projected_remaining_at_reset":1,"pacing',
  '":"SHORT"},"weekly":{"remaining_percent":1,"resets_at":"2026-01-31',
  'T17:30:00+00:00","burn_percent_per_hour":1,"projected_remaining_at',
  '_reset":1,"pacing":"SHORT"}}],"credits":[{"instance":"Codex pool A',
  '","t":"2026-01-31T17:30:00+00:00","remaining":1,"daily_burn":1,"da',
  'ily_target":1,"burn_vs_target":1}]},"models":{"coverage":"partial"',
  ',"observed_at":"2026-01-31T17:30:00+00:00","breakdown":[{"model":"',
  'Opus","role":"implementation","effort":"none","runs":1,"active":1,',
  '"completed":1,"terminal":1,"success":1,"rework":1,"success_rate":1',
  ',"rework_rate":1,"median_duration_seconds":1,"tokens_per_success":',
  '1,"session_percent_per_success":1,"tokens_measured_runs":1,"sessio',
  'n_measured_runs":1,"success_rate_change_7d":1,"tentative":true}],"',
  'series":[{"t":"2026-01-31T17:30:00+00:00","model":"Opus","role":"i',
  'mplementation","effort":"none","runs":1,"active":1,"completed":1,"',
  'terminal":1,"success":1,"rework":1,"success_rate":1,"rework_rate":',
  '1,"median_duration_seconds":1,"tokens_per_success":1,"session_perc',
  'ent_per_success":1,"tokens_measured_runs":1,"session_measured_runs',
  '":1,"success_rate_change_7d":1,"tentative":false}]},"fleet":{"cove',
  'rage":"ok","counts":[{"role":"Lead","top_level":1,"depth_1":1,"dep',
  'th_2_plus":1}],"series":[{"t":"2026-01-31T17:30:00+00:00","running',
  '":1,"waiting":1,"idle":1,"unknown":1}],"tree":[{"label":"Lead","pr',
  'oduct":"Tuturuuu","threads":1,"children":1,"grandchildren":1}]},"c',
  'oordination":{"coverage":"ok","messages":[{"t":"2026-01-31T17:30:0',
  '0+00:00","sender_role":"Lead","receiver_role":"Lead","count":1}],"',
  'latency":[{"t":"2026-01-31T17:30:00+00:00","median_seconds":1,"sam',
  'ples":1}],"queue":[{"t":"2026-01-31T17:30:00+00:00","depth":1,"ste',
  'er":null,"queue":1,"start":1}],"failures":[{"t":"2026-01-31T17:30:',
  '00+00:00","cause":"usage_limit","count":1}]},"delivery":{"coverage',
  '":"ok","ships":[{"t":"2026-01-31T17:30:00+00:00","product":"Tuturu',
  'uu","count":1}],"merge_to_live":[{"t":"2026-01-31T17:30:00+00:00",',
  '"product":"Tuturuuu","median_minutes":1,"samples":1}],"ci":[{"t":"',
  '2026-01-31T17:30:00+00:00","repo":"tutur3u/platform","queued":1,"r',
  'unning":1}],"open_prs":[{"t":"2026-01-31T17:30:00+00:00","product"',
  ':"Tuturuuu","count":1}]}},"sources":[{"source":"inbox","state":"ok',
  '"}]}',
].join();
