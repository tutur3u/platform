import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/task_estimate_board.dart';

void main() {
  test('boards without estimation configuration use API defaults', () {
    final board = TaskEstimateBoard.fromJson(const {'id': 'board-1'});
    expect(board.estimationType, isNull);
    expect(board.createdAt, isNull);
    expect(board.extendedEstimation, isFalse);
    expect(board.allowZeroEstimates, isTrue);
    expect(board.countUnestimatedIssues, isFalse);
    expect(TaskEstimateBoard.listFromJson(null), isEmpty);
    expect(TaskEstimateBoard.listFromJson([]), isEmpty);
  });

  for (final entry in <String, Object?>{
    'id': null,
    'name': 42,
    'created_at': 'invalid-date',
    'estimation_type': 'unexpected',
    'extended_estimation': 'true',
    'allow_zero_estimates': 0,
    'count_unestimated_issues': [],
  }.entries) {
    test('invalid ${entry.key} is a recoverable format error', () {
      expect(
        () => TaskEstimateBoard.fromJson({
          'id': 'board-1',
          entry.key: entry.value,
        }),
        throwsFormatException,
      );
    });
  }

  for (final value in <Object>[
    {},
    [null],
    [42],
  ]) {
    test('invalid collection $value is a recoverable format error', () {
      expect(
        () => TaskEstimateBoard.listFromJson(value),
        throwsFormatException,
      );
    });
  }
}
