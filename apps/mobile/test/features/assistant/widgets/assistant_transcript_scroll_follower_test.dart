import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/widgets/assistant_transcript_scroll_follower.dart';

/// A transcript that grows like a streaming reply: `grow` appends a token
/// line or a tool-call row and notifies the follower, as the page does.
class _Harness extends StatefulWidget {
  const _Harness({required this.controller, required this.follower});

  final ScrollController controller;
  final AssistantTranscriptScrollFollower follower;

  @override
  State<_Harness> createState() => _HarnessState();
}

class _HarnessState extends State<_Harness> {
  int lines = 30;

  void grow([int by = 1]) {
    setState(() => lines += by);
    widget.follower.followUpdate();
  }

  @override
  Widget build(BuildContext context) => MaterialApp(
    home: Scaffold(
      body: NotificationListener<Notification>(
        onNotification: (notification) {
          if (notification is ScrollNotification) {
            return widget.follower.observeNotification(notification);
          }
          if (notification is ScrollMetricsNotification) {
            widget.follower.followUpdate();
          }
          return false;
        },
        child: Listener(
          onPointerDown: (_) => widget.follower.pointerDown(),
          onPointerUp: (_) => widget.follower.pointerUp(),
          onPointerCancel: (_) => widget.follower.pointerUp(),
          child: ListView.builder(
            controller: widget.controller,
            physics: const AlwaysScrollableScrollPhysics(
              parent: BouncingScrollPhysics(),
            ),
            itemCount: lines,
            itemBuilder: (_, index) =>
                SizedBox(height: 40, child: Text('line $index')),
          ),
        ),
      ),
    ),
  );
}

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

  late ScrollController controller;
  late AssistantTranscriptScrollFollower follower;
  late List<bool> pill;

  setUp(() {
    controller = ScrollController();
    pill = [];
    follower = AssistantTranscriptScrollFollower(
      controller: controller,
      onVisibilityChanged: pill.add,
    );
  });

  tearDown(() {
    follower.dispose();
    controller.dispose();
  });

  Future<_HarnessState> mount(WidgetTester tester) async {
    await tester.pumpWidget(
      _Harness(controller: controller, follower: follower),
    );
    final state = tester.state<_HarnessState>(find.byType(_Harness))..grow(0);
    await tester.pumpAndSettle();
    return state;
  }

  double gap() => controller.position.maxScrollExtent - controller.offset;

  testWidgets('sticks to the bottom while streaming at the bottom', (
    tester,
  ) async {
    final state = await mount(tester);
    for (var i = 0; i < 5; i++) {
      state.grow();
      await tester.pump();
      await tester.pump();
    }
    expect(gap(), 0);
  });

  testWidgets('a short scroll up is never pulled back by streaming', (
    tester,
  ) async {
    final state = await mount(tester);
    // Well inside the old 160 px "still following" band.
    await tester.drag(find.byType(ListView), const Offset(0, 60));
    await tester.pumpAndSettle();
    final offset = controller.offset;
    for (var i = 0; i < 5; i++) {
      state.grow(2); // token lines and a tool-call row
      await tester.pump();
      await tester.pump();
    }
    expect(controller.offset, offset);
    expect(gap(), greaterThan(60));
    expect(pill.last, isTrue);
  });

  testWidgets('a resting finger is not yanked to new output', (tester) async {
    final state = await mount(tester);
    final gesture = await tester.startGesture(
      tester.getCenter(find.byType(ListView)),
    );
    await tester.pump();
    state.grow(3);
    await tester.pump();
    await tester.pump();
    expect(gap(), greaterThan(0));
    await gesture.up();
  });

  testWidgets('returning to the bottom re-attaches following', (tester) async {
    final state = await mount(tester);
    await tester.drag(find.byType(ListView), const Offset(0, 300));
    await tester.pumpAndSettle();
    await tester.drag(find.byType(ListView), const Offset(0, -2000));
    await tester.pumpAndSettle();
    state.grow(2);
    await tester.pump();
    await tester.pump();
    expect(gap(), 0);
    expect(pill.last, isFalse);
  });

  testWidgets('jump to latest resumes following', (tester) async {
    final state = await mount(tester);
    await tester.drag(find.byType(ListView), const Offset(0, 400));
    await tester.pumpAndSettle();
    follower.resume();
    controller.jumpTo(controller.position.maxScrollExtent);
    await tester.pump();
    state.grow(4);
    await tester.pump();
    await tester.pump();
    expect(gap(), 0);
  });
}
