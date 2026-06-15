import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/tasks_boards/utils/task_board_timeline_window.dart';

void main() {
  group('resolveTaskBoardTimelineWindow', () {
    test('keeps normal board ranges with padding', () {
      final window = resolveTaskBoardTimelineWindow(
        now: DateTime(2026, 6, 15, 12),
        schedules: [
          TaskBoardTimelineSchedule(
            startDate: DateTime(2026, 6, 10, 18),
            endDate: DateTime(2026, 6, 20, 9),
          ),
        ],
      );

      expect(window.startDate, DateTime(2026, 6, 7));
      expect(window.endDate, DateTime(2026, 6, 27));
      expect(window.dayCount, 21);
    });

    test('caps extreme ranges around today when the span crosses today', () {
      final window = resolveTaskBoardTimelineWindow(
        now: DateTime(2026, 6, 15, 12),
        schedules: [
          TaskBoardTimelineSchedule(
            startDate: DateTime(1),
            endDate: DateTime(9999, 12, 31),
          ),
        ],
      );

      expect(window.dayCount, taskBoardTimelineMaxVisibleDays);
      expect(window.startDate, DateTime(2025, 6, 15));
      expect(window.endDate, DateTime(2027, 6, 14));
    });

    test('caps future-only ranges from their first visible day', () {
      final window = resolveTaskBoardTimelineWindow(
        now: DateTime(2026, 6, 15),
        schedules: [
          TaskBoardTimelineSchedule(
            startDate: DateTime(9998),
            endDate: DateTime(9999, 12, 31),
          ),
        ],
      );

      expect(window.dayCount, taskBoardTimelineMaxVisibleDays);
      expect(window.startDate, DateTime(9997, 12, 29));
      expect(window.endDate, DateTime(9999, 12, 28));
    });

    test('caps past-only ranges through their last visible day', () {
      final window = resolveTaskBoardTimelineWindow(
        now: DateTime(2026, 6, 15),
        schedules: [
          TaskBoardTimelineSchedule(
            startDate: DateTime(1),
            endDate: DateTime(3),
          ),
        ],
      );

      expect(window.dayCount, taskBoardTimelineMaxVisibleDays);
      expect(
        window.startDate,
        window.endDate.subtract(
          const Duration(days: taskBoardTimelineMaxVisibleDays - 1),
        ),
      );
      expect(window.endDate, DateTime(3, 1, 8));
    });
  });

  group('TaskBoardTimelineWindow.clampDate', () {
    test('normalizes and clamps dates into the visible window', () {
      final window = TaskBoardTimelineWindow(
        startDate: DateTime(2026, 6),
        endDate: DateTime(2026, 6, 30),
      );

      expect(window.clampDate(DateTime(2026, 5)), DateTime(2026, 6));
      expect(window.clampDate(DateTime(2026, 7)), DateTime(2026, 6, 30));
      expect(
        window.clampDate(DateTime(2026, 6, 15, 23, 59)),
        DateTime(2026, 6, 15),
      );
    });
  });
}
