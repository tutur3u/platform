import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/widgets/assistant_transcript_scroll_follower.dart';

void main() {
  testWidgets('large stream chunks follow; reading history stays in place', (
    tester,
  ) async {
    final controller = ScrollController();
    var jumpVisible = false;
    final follower = AssistantTranscriptScrollFollower(
      controller: controller,
      onVisibilityChanged: (value) => jumpVisible = value,
    );
    controller.addListener(follower.observeScroll);
    addTearDown(controller.dispose);
    addTearDown(follower.dispose);
    var rows = 12;
    late StateSetter update;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: StatefulBuilder(
            builder: (context, setState) {
              update = setState;
              return NotificationListener<Notification>(
                onNotification: (notification) {
                  if (notification is ScrollNotification) {
                    return follower.observeNotification(notification);
                  }
                  if (notification is ScrollMetricsNotification) {
                    follower.followUpdate();
                  }
                  return false;
                },
                child: ListView(
                  controller: controller,
                  children: [
                    for (var i = 0; i < rows; i++)
                      SizedBox(height: 100, child: Text('Message $i')),
                  ],
                ),
              );
            },
          ),
        ),
      ),
    );
    follower.followUpdate();
    await tester.pumpAndSettle();
    expect(controller.position.extentAfter, 0);
    // Multiple updates before layout must converge to the newest large extent.
    update(() => rows += 20);
    follower.followUpdate();
    update(() => rows += 20);
    follower.followUpdate();
    await tester.pumpAndSettle();
    expect(controller.position.extentAfter, 0);
    expect(jumpVisible, isFalse);
    await tester.drag(find.byType(ListView), const Offset(0, 400));
    await tester.pumpAndSettle();
    final readingOffset = controller.offset;
    expect(controller.position.extentAfter, greaterThan(160));
    update(() => rows += 10);
    follower.followUpdate();
    await tester.pumpAndSettle();
    expect(controller.offset, readingOffset);
    expect(jumpVisible, isTrue);
    expect(tester.binding.hasScheduledFrame, isFalse);
    follower
      ..resume()
      ..followUpdate();
    expect(tester.binding.hasScheduledFrame, isTrue);
    await tester.pumpAndSettle();
    expect(controller.position.extentAfter, 0);
    expect(jumpVisible, isFalse);
    // A short drag can release within the threshold, then fling into history.
    await tester.fling(find.byType(ListView), const Offset(0, 70), 3000);
    await tester.pumpAndSettle();
    expect(controller.position.extentAfter, greaterThan(160));
    final flungOffset = controller.offset;
    update(() => rows += 10);
    follower.followUpdate();
    await tester.pumpAndSettle();
    expect(controller.offset, flungOffset);
    expect(jumpVisible, isTrue);
    follower
      ..followUpdate()
      ..dispose();
    await tester.pumpWidget(const SizedBox.shrink());
    expect(tester.takeException(), isNull);
  });
}
