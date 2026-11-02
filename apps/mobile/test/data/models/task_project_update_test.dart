import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/task_project_update.dart';

void main() {
  group('TaskProjectUpdateCreator', () {
    test('parses snake_case fields', () {
      final creator = TaskProjectUpdateCreator.fromJson(const {
        'id': 'u1',
        'display_name': 'Ada',
        'avatar_url': 'https://example.com/a.png',
      });

      expect(creator.id, 'u1');
      expect(creator.displayName, 'Ada');
      expect(creator.avatarUrl, 'https://example.com/a.png');
    });

    test('defaults id to empty and keeps optionals null', () {
      final creator = TaskProjectUpdateCreator.fromJson(const {});

      expect(creator.id, '');
      expect(creator.displayName, isNull);
      expect(creator.avatarUrl, isNull);
    });

    test('compares by value', () {
      expect(
        const TaskProjectUpdateCreator(id: 'u1', displayName: 'Ada'),
        const TaskProjectUpdateCreator(id: 'u1', displayName: 'Ada'),
      );
      expect(
        const TaskProjectUpdateCreator(id: 'u1'),
        isNot(const TaskProjectUpdateCreator(id: 'u2')),
      );
    });
  });

  group('TaskProjectUpdateReactionGroup', () {
    test('parses emoji and integral counts, including doubles', () {
      final group = TaskProjectUpdateReactionGroup.fromJson(const {
        'emoji': '🎉',
        'count': 3.0,
      });

      expect(group.emoji, '🎉');
      expect(group.count, 3);
    });

    test('defaults to empty emoji and zero count', () {
      final group = TaskProjectUpdateReactionGroup.fromJson(const {});

      expect(group.emoji, '');
      expect(group.count, 0);
    });

    test('compares by value', () {
      expect(
        const TaskProjectUpdateReactionGroup(emoji: 'a', count: 1),
        const TaskProjectUpdateReactionGroup(emoji: 'a', count: 1),
      );
    });
  });

  group('TaskProjectUpdate', () {
    final fullJson = <String, dynamic>{
      'id': 'up1',
      'project_id': 'p1',
      'creator_id': 'u1',
      'content': 'Shipped',
      'created_at': '2026-10-01T10:00:00.000Z',
      'updated_at': '2026-10-02T10:00:00.000Z',
      'creator': {'id': 'u1', 'display_name': 'Ada'},
      'reactionGroups': [
        {'emoji': '👍', 'count': 2},
        'not a map',
        {'emoji': '🎉', 'count': 1},
      ],
      'commentsCount': 4,
      'attachmentsCount': 1,
    };

    test('parses every field and skips malformed reaction groups', () {
      final update = TaskProjectUpdate.fromJson(fullJson);

      expect(update.id, 'up1');
      expect(update.projectId, 'p1');
      expect(update.creatorId, 'u1');
      expect(update.content, 'Shipped');
      expect(update.createdAt, DateTime.utc(2026, 10, 1, 10));
      expect(update.updatedAt, DateTime.utc(2026, 10, 2, 10));
      expect(update.creator?.displayName, 'Ada');
      expect(update.reactionGroups.map((g) => g.emoji), ['👍', '🎉']);
      expect(update.commentsCount, 4);
      expect(update.attachmentsCount, 1);
    });

    test('uses defaults for an empty payload', () {
      final update = TaskProjectUpdate.fromJson(const {});

      expect(update.id, '');
      expect(update.projectId, '');
      expect(update.creatorId, '');
      expect(update.content, '');
      expect(update.createdAt, DateTime.fromMillisecondsSinceEpoch(0));
      expect(update.updatedAt, isNull);
      expect(update.creator, isNull);
      expect(update.reactionGroups, isEmpty);
      expect(update.commentsCount, 0);
      expect(update.attachmentsCount, 0);
    });

    test('falls back on unparsable dates and a non-map creator', () {
      final update = TaskProjectUpdate.fromJson(const {
        'created_at': 'yesterday',
        'updated_at': 'later',
        'creator': 'Ada',
      });

      expect(update.createdAt, DateTime.fromMillisecondsSinceEpoch(0));
      expect(update.updatedAt, isNull);
      expect(update.creator, isNull);
      expect(update.isEdited, isFalse);
    });

    test('isEdited is false without updatedAt or when equal to createdAt', () {
      final created = DateTime.utc(2026, 10);

      expect(
        TaskProjectUpdate(
          id: 'a',
          projectId: 'p',
          creatorId: 'u',
          content: '',
          createdAt: created,
        ).isEdited,
        isFalse,
      );
      expect(
        TaskProjectUpdate(
          id: 'a',
          projectId: 'p',
          creatorId: 'u',
          content: '',
          createdAt: created,
          updatedAt: created,
        ).isEdited,
        isFalse,
      );
    });

    test('isEdited is true when updatedAt differs from createdAt', () {
      expect(TaskProjectUpdate.fromJson(fullJson).isEdited, isTrue);
    });

    test('compares by value across nested models', () {
      expect(
        TaskProjectUpdate.fromJson(fullJson),
        TaskProjectUpdate.fromJson(fullJson),
      );
      expect(
        TaskProjectUpdate.fromJson(fullJson),
        isNot(TaskProjectUpdate.fromJson({...fullJson, 'commentsCount': 5})),
      );
    });

    test('reaction groups are returned as a fixed-length list', () {
      final update = TaskProjectUpdate.fromJson(fullJson);

      expect(
        () => update.reactionGroups.add(
          const TaskProjectUpdateReactionGroup(emoji: 'x', count: 1),
        ),
        throwsUnsupportedError,
      );
    });
  });
}
