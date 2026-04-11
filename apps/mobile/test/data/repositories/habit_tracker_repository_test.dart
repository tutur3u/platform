import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/habit_tracker.dart';
import 'package:mobile/data/repositories/habit_tracker_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mocktail/mocktail.dart';

class _MockApiClient extends Mock implements ApiClient {}

HabitTrackerFieldSchema _numberField(String key, String label) {
  return HabitTrackerFieldSchema(
    key: key,
    label: label,
    type: HabitTrackerFieldType.number,
    required: true,
  );
}

Map<String, dynamic> _trackerJson(String id) => {
  'id': id,
  'ws_id': 'ws-1',
  'name': 'Water',
  'description': 'Track hydration',
  'color': 'CYAN',
  'icon': 'Droplets',
  'tracking_mode': 'event_log',
  'target_period': 'daily',
  'target_operator': 'gte',
  'target_value': 8,
  'primary_metric_key': 'glasses',
  'aggregation_strategy': 'sum',
  'input_schema': [
    {'key': 'glasses', 'label': 'Glasses', 'type': 'number', 'required': true},
  ],
  'quick_add_values': [1, 2, 3],
  'freeze_allowance': 2,
  'recovery_window_periods': 1,
  'start_date': '2026-03-25',
  'is_active': true,
  'created_at': '2026-03-25T00:00:00.000Z',
  'updated_at': '2026-03-25T00:00:00.000Z',
};

Map<String, dynamic> _listResponseJson() => {
  'trackers': [
    {
      'tracker': _trackerJson('tracker-1'),
      'current_member': {
        'member': {
          'user_id': 'user-1',
          'display_name': 'Alex',
        },
        'total': 12,
        'entry_count': 4,
        'current_period_total': 4,
        'streak': {
          'current_streak': 3,
          'best_streak': 5,
          'freeze_count': 2,
          'freezes_used': 0,
          'perfect_week_count': 1,
          'consistency_rate': 0.75,
          'recovery_window': {'eligible': false},
        },
      },
      'team': {
        'active_members': 2,
        'total_entries': 8,
        'total_value': 16,
        'average_consistency_rate': 0.8,
        'top_streak': 5,
      },
      'leaderboard': const <dynamic>[],
    },
  ],
  'members': [
    {
      'user_id': 'user-1',
      'display_name': 'Alex',
    },
  ],
  'scope': 'self',
  'viewerUserId': 'viewer-1',
};

Map<String, dynamic> _detailResponseJson() => {
  'tracker': _trackerJson('tracker-1'),
  'entries': [
    {
      'id': 'entry-1',
      'ws_id': 'ws-1',
      'tracker_id': 'tracker-1',
      'user_id': 'user-1',
      'entry_kind': 'event_log',
      'entry_date': '2026-03-25',
      'occurred_at': '2026-03-25T10:00:00.000Z',
      'values': {'glasses': 2},
      'primary_value': 2,
      'tags': ['morning'],
      'created_at': '2026-03-25T10:00:00.000Z',
      'updated_at': '2026-03-25T10:00:00.000Z',
    },
  ],
  'member_summaries': const <dynamic>[],
  'leaderboard': const <dynamic>[],
  'current_period_metrics': const <dynamic>[],
};

void main() {
  group('HabitTrackerRepository', () {
    late _MockApiClient apiClient;
    late HabitTrackerRepository repository;

    setUp(() {
      apiClient = _MockApiClient();
      repository = HabitTrackerRepository(apiClient: apiClient);
    });

    test('listTrackers includes member scope query parameters', () async {
      when(
        () => apiClient.getJson(
          '/api/v1/workspaces/ws-1/habit-trackers?scope=member&userId=user-2',
        ),
      ).thenAnswer((_) async => _listResponseJson());

      final result = await repository.listTrackers(
        'ws-1',
        scope: HabitTrackerScope.member,
        userId: 'user-2',
      );

      expect(result.scope, HabitTrackerScope.self);
      expect(result.trackers.single.tracker.name, 'Water');
      verify(
        () => apiClient.getJson(
          '/api/v1/workspaces/ws-1/habit-trackers?scope=member&userId=user-2',
        ),
      ).called(1);
    });

    test('getTrackerDetail parses entries and nested tracker data', () async {
      when(
        () => apiClient.getJson(
          '/api/v1/workspaces/ws-1/habit-trackers/tracker-1?scope=self',
        ),
      ).thenAnswer((_) async => _detailResponseJson());

      final detail = await repository.getTrackerDetail('ws-1', 'tracker-1');

      expect(detail.tracker.primaryMetricKey, 'glasses');
      expect(detail.entries.single.values['glasses'], 2);
      verify(
        () => apiClient.getJson(
          '/api/v1/workspaces/ws-1/habit-trackers/tracker-1?scope=self',
        ),
      ).called(1);
    });

    test('createEntry posts snake_case payload', () async {
      const input = HabitTrackerEntryInput(
        entryDate: '2026-03-25',
        values: {'glasses': 2.0},
        note: 'Morning',
        tags: ['hydration'],
      );

      when(
        () => apiClient.postJson(
          '/api/v1/workspaces/ws-1/habit-trackers/tracker-1/entries',
          any(),
        ),
      ).thenAnswer(
        (_) async => {
          'entry': {
            'id': 'entry-1',
            'ws_id': 'ws-1',
            'tracker_id': 'tracker-1',
            'user_id': 'user-1',
            'entry_kind': 'event_log',
            'entry_date': '2026-03-25',
            'values': {'glasses': 2},
            'tags': ['hydration'],
            'created_at': '2026-03-25T10:00:00.000Z',
            'updated_at': '2026-03-25T10:00:00.000Z',
          },
        },
      );

      await repository.createEntry('ws-1', 'tracker-1', input);

      verify(
        () => apiClient.postJson(
          '/api/v1/workspaces/ws-1/habit-trackers/tracker-1/entries',
          {
            'entry_date': '2026-03-25',
            'values': {'glasses': 2.0},
            'note': 'Morning',
            'tags': ['hydration'],
          },
        ),
      ).called(1);
    });

    test('updateTracker sends the tracker contract payload', () async {
      final input = HabitTrackerInput(
        name: 'Water',
        color: 'CYAN',
        icon: 'Droplets',
        trackingMode: HabitTrackerTrackingMode.eventLog,
        targetPeriod: HabitTrackerTargetPeriod.daily,
        targetOperator: HabitTrackerTargetOperator.gte,
        targetValue: 8,
        primaryMetricKey: 'glasses',
        aggregationStrategy: HabitTrackerAggregationStrategy.sum,
        inputSchema: [_numberField('glasses', 'Glasses')],
        quickAddValues: const [1, 2, 3],
        freezeAllowance: 2,
        recoveryWindowPeriods: 1,
        startDate: '2026-03-25',
      );

      when(
        () => apiClient.patchJson(
          '/api/v1/workspaces/ws-1/habit-trackers/tracker-1',
          any(),
        ),
      ).thenAnswer((_) async => {'tracker': _trackerJson('tracker-1')});

      await repository.updateTracker('ws-1', 'tracker-1', input);

      verify(
        () => apiClient.patchJson(
          '/api/v1/workspaces/ws-1/habit-trackers/tracker-1',
          {
            'name': 'Water',
            'color': 'CYAN',
            'icon': 'Droplets',
            'tracking_mode': 'event_log',
            'target_period': 'daily',
            'target_operator': 'gte',
            'target_value': 8.0,
            'primary_metric_key': 'glasses',
            'aggregation_strategy': 'sum',
            'input_schema': [
              {
                'key': 'glasses',
                'label': 'Glasses',
                'type': 'number',
                'required': true,
              },
            ],
            'quick_add_values': [1.0, 2.0, 3.0],
            'freeze_allowance': 2,
            'recovery_window_periods': 1,
            'use_case': 'generic',
            'template_category': 'custom',
            'composer_mode': 'advanced_custom',
            'composer_config': {
              'progress_variant': 'ring',
            },
            'start_date': '2026-03-25',
            'is_active': true,
          },
        ),
      ).called(1);
    });
  });
}
