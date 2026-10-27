import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/parse/snapshot_parser.dart';

import '../../../helpers/mastermind_snapshot_builder.dart';

typedef Json = Map<String, dynamic>;

Uint8List encode(Object? value) =>
    Uint8List.fromList(utf8.encode(jsonEncode(value)));
Json map(Object? value) => value! as Json;
List<dynamic> list(Object? value) => value! as List<dynamic>;
Json observability(Json root) => map(root['observability']);
Json usage(Json root) => map(observability(root)['usage']);
Json needsYou(Json root) => map(list(map(root['now'])['needs_you']).first);

Json security(String? product, {Json extra = const {}}) => {
  'title': 'Security issue',
  'state': 'open',
  'product': ?product,
  ...extra,
};

ParseOutcome parse(Json root) => parseMastermindSnapshot(encode(root));

void expectViolation(Json root, [String? path]) {
  final result = parse(root);
  expect(result, isA<ParseRejected>());
  expect((result as ParseRejected).reason, RejectionReason.schemaViolation);
  if (path != null) expect(result.path, path);
}

MastermindSnapshot accepted(Json root) =>
    (parse(root) as ParseAccepted).snapshot;

void main() {
  group('1. schema version', () {
    test('accepts 1.4 only', () {
      final snapshot = accepted(MastermindSnapshotBuilder.defaults().toJson());
      expect(snapshot.schemaVersion, '1.4');
    });
    for (final version in ['1.3', '1.2', '1.5', '2.0', '']) {
      test('rejects schema_version "$version" as unsupported', () {
        final root = MastermindSnapshotBuilder.defaults().toJson()
          ..['schema_version'] = version;
        final result = parse(root);
        expect(result, isA<ParseRejected>());
        expect(
          (result as ParseRejected).reason,
          RejectionReason.unsupportedVersion,
        );
      });
    }
    test('rejects a non-string or missing version', () {
      final numeric = MastermindSnapshotBuilder.defaults().toJson()
        ..['schema_version'] = 1.4;
      expect(
        (parse(numeric) as ParseRejected).reason,
        RejectionReason.unsupportedVersion,
      );
      final missing = MastermindSnapshotBuilder.defaults().toJson()
        ..remove('schema_version');
      expectViolation(missing);
    });
    test('a 1.3 payload is rejected even with otherwise valid 1.4 shape', () {
      final root = MastermindSnapshotBuilder.defaults().toJson()
        ..['schema_version'] = '1.3';
      expect(parse(root), isA<ParseRejected>());
    });
  });

  group('2. security data', () {
    test('observability.security is removed and rejected when present', () {
      final root = MastermindSnapshotBuilder.defaults().toJson();
      observability(root)['security'] = {
        'coverage': 'ok',
        'register': <dynamic>[],
        'series': <dynamic>[],
        'time_to_fix': <dynamic>[],
      };
      expectViolation(root);
    });
    test('observability without security is accepted', () {
      final root = MastermindSnapshotBuilder.defaults().toJson();
      expect(observability(root).containsKey('security'), isFalse);
      expect(parse(root), isA<ParseAccepted>());
    });
    test('security rows are title, state and product only', () {
      final b = MastermindSnapshotBuilder.defaults()..securityVariants = true;
      final snapshot = accepted(b.toJson());
      for (final row in [
        snapshot.lanes.last,
        snapshot.now.needsYou.last,
        snapshot.backlog.last,
      ]) {
        final item = row as SecurityItem;
        expect(item.title, 'Security issue');
        expect(item.state, LaneState.open);
        expect(item.product, Product.mastermind);
      }
    });
    test('a security row may omit product', () {
      final root = MastermindSnapshotBuilder.defaults().toJson()
        ..['backlog'] = [security(null)];
      expect((accepted(root).backlog.single as SecurityItem).product, isNull);
    });
    for (final section in ['lanes', 'backlog', 'needs_you']) {
      void put(Json root, List<Json> rows) {
        if (section == 'needs_you') {
          map(root['now'])['needs_you'] = rows;
        } else {
          root[section] = rows;
        }
      }

      test('$section: severity on a security row is rejected', () {
        final root = MastermindSnapshotBuilder.defaults().toJson();
        put(root, [
          security('Mastermind', extra: {'severity': 'high'}),
        ]);
        expectViolation(root);
      });
      test('$section: a second security row for one product is rejected', () {
        final root = MastermindSnapshotBuilder.defaults().toJson();
        put(root, [security('Tuturuuu'), security('Tuturuuu')]);
        final prefix = section == 'needs_you' ? '/now/needs_you' : '/$section';
        expectViolation(root, '$prefix/1');
      });
      test('$section: two security rows without product are rejected', () {
        final root = MastermindSnapshotBuilder.defaults().toJson();
        put(root, [security(null), security(null)]);
        expectViolation(root);
      });
      test('$section: one security row per product is accepted', () {
        final root = MastermindSnapshotBuilder.defaults().toJson();
        put(root, [
          for (final p in ['Tuturuuu', 'Upskii', 'Mastermind']) security(p),
        ]);
        expect(parse(root), isA<ParseAccepted>());
      });
    }
    test('needs_you items no longer accept severity', () {
      final root = MastermindSnapshotBuilder.defaults().toJson();
      needsYou(root)['severity'] = 'low';
      expectViolation(root);
    });
    test('digest event payloads no longer accept severity', () {
      final root = MastermindSnapshotBuilder.defaults().toJson();
      final event = map(list(map(root['now'])['digest']).first);
      map(event['payload'])['severity'] = 'low';
      expectViolation(root);
    });
    test('the needs_you kind is decision, action or fyi only', () {
      for (final kind in ['decision', 'action', 'fyi']) {
        final root = MastermindSnapshotBuilder.defaults().toJson();
        needsYou(root)['kind'] = kind;
        final item = accepted(root).now.needsYou.single as NeedsYou;
        expect(item.kind!.wireName, kind);
      }
      final root = MastermindSnapshotBuilder.defaults().toJson();
      needsYou(root)['kind'] = 'security';
      expectViolation(root);
    });
  });

  group('3. decisions', () {
    test('the security decision variant is rejected', () {
      final root = MastermindSnapshotBuilder.defaults().toJson()
        ..['decisions'] = [
          {
            'id': 'd_000000000001',
            'at': '2026-01-31T17:30:00+00:00',
            'title': 'Security fix',
            'area': 'security',
            'risk': 'high',
          },
        ];
      expectViolation(root);
    });
    test('area security is rejected on a plain journal decision', () {
      final root = MastermindSnapshotBuilder.defaults().toJson();
      map(list(root['decisions']).first)['area'] = 'security';
      expectViolation(root, '/decisions/0/area');
    });
    test('plain decisions remain journal decisions', () {
      final snapshot = accepted(MastermindSnapshotBuilder.defaults().toJson());
      expect(snapshot.decisions.single, isA<JournalDecision>());
      expect(
        DecisionArea.values.map((a) => a.wireName),
        isNot(contains('security')),
      );
    });
  });

  group('4. staff', () {
    Json staff(Json root) => map(list(observability(root)['staff']).first);
    test('accepts role, title, state and model only', () {
      final root = MastermindSnapshotBuilder.defaults().toJson();
      expect(staff(root).keys, ['role', 'title', 'state', 'model']);
      expect(accepted(root).observability.staff.single.model, isNotEmpty);
    });
    for (final entry in {
      'last_active': '2026-01-31T17:30:00+00:00',
      'runs_today': 1,
    }.entries) {
      test('rejects staff.${entry.key}', () {
        final root = MastermindSnapshotBuilder.defaults().toJson();
        staff(root)[entry.key] = entry.value;
        expectViolation(root);
      });
    }
  });

  group('5. pool labels', () {
    const claude = [
      'Claude pool A',
      'Claude pool B',
      'Claude pool C',
      'Claude pool D',
      'Claude pool E',
    ];
    const codex = ['Codex pool A', 'Codex pool B'];
    Json usageRow(Json root) => map(list(usage(root)['series']).first);
    Json credit(Json root) => map(list(usage(root)['credits']).first);
    Json quota(Json root) => map(list(map(root['products'])['quotas']).first);
    Json quotaPoint(Json root) =>
        map(list(observability(root)['quota_series']).first);
    Json forecast(Json root) =>
        map(list(observability(root)['quota_forecasts']).first);

    test('usage instances and series keep the label verbatim', () {
      for (final label in [...claude, ...codex]) {
        final root = MastermindSnapshotBuilder.defaults().toJson();
        usageRow(root)['instance'] = label;
        map(list(usage(root)['instances']).first)['instance'] = label;
        final parsed = accepted(root).observability.usage;
        expect(parsed.series.first.instance, label);
        expect(parsed.instances.first.instance, label);
      }
    });
    test('credits accept only the Codex pools', () {
      for (final label in codex) {
        final root = MastermindSnapshotBuilder.defaults().toJson();
        credit(root)['instance'] = label;
        expect(
          accepted(root).observability.usage.credits.first.instance,
          label,
        );
      }
      for (final label in [...claude, 'Unknown account']) {
        final root = MastermindSnapshotBuilder.defaults().toJson();
        credit(root)['instance'] = label;
        expectViolation(root);
      }
    });
    test('quotas, quota series and forecasts also accept Unknown account', () {
      for (final label in [...claude, ...codex, 'Unknown account']) {
        final root = MastermindSnapshotBuilder.defaults().toJson();
        quota(root)['instance'] = label;
        quotaPoint(root)['instance'] = label;
        forecast(root)['instance'] = label;
        final snapshot = accepted(root);
        expect(snapshot.products.quotas.first.instance, label);
        expect(snapshot.observability.quotaSeries.first.instance, label);
        expect(snapshot.observability.quotaForecasts.first.instance, label);
      }
    });
    test('usage rows reject Unknown account', () {
      final root = MastermindSnapshotBuilder.defaults().toJson();
      usageRow(root)['instance'] = 'Unknown account';
      expectViolation(root);
    });
    for (final handle in [
      'claude_fixture',
      'codex_fixture',
      'fixture_account',
      'claude pool A',
      'Claude pool F',
      'Claude pool A ',
      '',
    ]) {
      test('rejects the instance "$handle" everywhere', () {
        for (final put in [
          (Json r) => usageRow(r)['instance'] = handle,
          (Json r) => credit(r)['instance'] = handle,
          (Json r) => quota(r)['instance'] = handle,
          (Json r) => quotaPoint(r)['instance'] = handle,
          (Json r) => forecast(r)['instance'] = handle,
        ]) {
          final root = MastermindSnapshotBuilder.defaults().toJson();
          put(root);
          expectViolation(root);
        }
      });
    }
    test('display_name is removed from usage rows and credits', () {
      for (final row in [usageRow, credit]) {
        final root = MastermindSnapshotBuilder.defaults().toJson();
        row(root)['display_name'] = 'fixture';
        expectViolation(root);
      }
    });
    test('children_series provider is a closed value', () {
      Json child(Json r) =>
          map(list(observability(r)['children_series']).first);
      for (final provider in ['claude', 'codex', 'antigravity', 'unknown']) {
        final root = MastermindSnapshotBuilder.defaults().toJson();
        child(root)['provider'] = provider;
        expect(
          accepted(root).observability.childrenSeries.first.provider,
          provider,
        );
      }
      final root = MastermindSnapshotBuilder.defaults().toJson();
      child(root)['provider'] = 'Synthetic provider';
      expectViolation(root);
    });
  });

  group('6. display text', () {
    Json environment(Json root) => map(list(root['environments']).first);
    test('commit_subject and version_tag are passed through verbatim', () {
      for (final subject in [
        'fix · ci',
        'feat',
        'Code change',
        'Withheld, open on Mac',
      ]) {
        final root = MastermindSnapshotBuilder.defaults().toJson();
        environment(root)['commit_subject'] = subject;
        environment(root)['version_tag'] = 'v1.2.3';
        final row = accepted(root).environments.first;
        expect(row.commitSubject, subject);
        expect(row.versionTag, 'v1.2.3');
      }
    });
    test('commit_subject rejects the pre-1.4 Security fix marker', () {
      final root = MastermindSnapshotBuilder.defaults().toJson();
      environment(root)['commit_subject'] = 'Security fix';
      expectViolation(root);
    });
    test('commit_subject and version_tag may be null', () {
      final root = MastermindSnapshotBuilder.defaults().toJson();
      environment(root)['commit_subject'] = null;
      environment(root)['version_tag'] = null;
      final row = accepted(root).environments.first;
      expect(row.commitSubject, isNull);
      expect(row.versionTag, isNull);
    });
    test('provider_model is passed through verbatim', () {
      for (final value in [
        'claude / claude-opus-4-1',
        'gpt-5.1',
        'Unknown model',
      ]) {
        final root = MastermindSnapshotBuilder.defaults().toJson();
        map(list(root['lanes']).first)['provider_model'] = value;
        expect((accepted(root).lanes.first as Lane).providerModel, value);
      }
    });
    test('display text keeps its length caps', () {
      final root = MastermindSnapshotBuilder.defaults().toJson();
      environment(root)['commit_subject'] = 'x' * 121;
      expectViolation(root);
    });
  });
}
