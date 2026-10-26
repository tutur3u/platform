import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/interaction/app_haptics.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/assistant/cubit/assistant_live_cubit.dart';
import 'package:mobile/features/assistant/models/assistant_live_call_phase.dart';
import 'package:mobile/features/assistant/widgets/assistant_live_call_captions.dart';
import 'package:mobile/features/assistant/widgets/assistant_live_call_controls_grid.dart';
import 'package:mobile/features/assistant/widgets/assistant_live_call_ended_actions.dart';
import 'package:mobile/features/assistant/widgets/assistant_live_call_header.dart';

/// Actions the call surface delegates to the Assistant page, which owns
/// permissions, text entry and session lifecycle.
class AssistantLiveCallActions {
  const AssistantLiveCallActions({
    required this.toggleMicrophone,
    required this.toggleCamera,
    required this.openKeyboard,
    required this.end,
    required this.callAgain,
    required this.minimize,
  });

  final Future<void> Function() toggleMicrophone;
  final Future<void> Function() toggleCamera;
  final Future<void> Function() openKeyboard;
  final Future<void> Function() end;
  final Future<void> Function() callAgain;
  final Future<void> Function() minimize;
}

/// Phone-call layout for one [AssistantLiveState]: identity and status up
/// top, optional captions, then call controls or ended actions.
class AssistantLiveCallView extends StatefulWidget {
  const AssistantLiveCallView({
    required this.state,
    required this.assistantName,
    required this.actions,
    this.initialCaptionsOpen = false,
    this.awaitingStart = false,
    super.key,
  });

  final AssistantLiveState state;
  final String assistantName;
  final AssistantLiveCallActions actions;
  final bool initialCaptionsOpen;

  /// The surface opened for a call whose session has not started yet.
  final bool awaitingStart;

  @override
  State<AssistantLiveCallView> createState() => _AssistantLiveCallViewState();
}

class _AssistantLiveCallViewState extends State<AssistantLiveCallView> {
  late bool _captionsOpen = widget.initialCaptionsOpen;

  Future<void> _end() async {
    unawaited(AppHaptics.drop());
    await widget.actions.end();
  }

  @override
  Widget build(BuildContext context) {
    final state = widget.state;
    final actions = widget.actions;
    final phase = assistantLiveCallPhase(
      state,
      awaitingStart: widget.awaitingStart,
    );
    final size = MediaQuery.sizeOf(context);
    final orbSize = (size.height * .26).clamp(136.0, 260.0);
    final showCaptions = _captionsOpen && phase.isActive;
    return SafeArea(
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 560),
          child: Padding(
            padding: EdgeInsets.fromLTRB(
              AppSpacing.xxl,
              size.height < 640 ? AppSpacing.lg : AppSpacing.huge,
              AppSpacing.xxl,
              AppSpacing.xxl,
            ),
            // At least full height, so the status sits centred above the
            // controls; short (landscape) or large-text layouts scroll instead
            // of overflowing.
            child: LayoutBuilder(
              builder: (context, constraints) => SingleChildScrollView(
                child: ConstrainedBox(
                  constraints: BoxConstraints(
                    minHeight: constraints.maxHeight,
                    minWidth: constraints.maxWidth,
                  ),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const SizedBox.shrink(),
                      AssistantLiveCallHeader(
                        assistantName: widget.assistantName,
                        phase: phase,
                        energy: state.assistantAudioLevel,
                        bands: state.assistantSpectrum,
                        speaking: state.isAssistantSpeaking,
                        muted: !state.isMicrophoneActive,
                        startedAt: state.callStartedAt,
                        endedDuration: state.lastCallDuration,
                        orbSize: showCaptions ? orbSize * .7 : orbSize,
                      ),
                      Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const SizedBox(height: AppSpacing.xxl),
                          if (showCaptions) ...[
                            AssistantLiveCallCaptions(
                              captions: assistantLiveCaptions(state),
                              assistantName: widget.assistantName,
                              maxHeight: size.height * .26,
                            ),
                            const SizedBox(height: AppSpacing.xxl),
                          ],
                          if (phase.isActive)
                            AssistantLiveCallControlsGrid(
                              connected:
                                  phase == AssistantLiveCallPhase.connected,
                              microphoneOn: state.isMicrophoneActive,
                              cameraOn: state.isCameraActive,
                              captionsOpen: _captionsOpen,
                              onMicrophone: actions.toggleMicrophone,
                              onCamera: actions.toggleCamera,
                              onKeyboard: actions.openKeyboard,
                              onCaptions: () async => setState(
                                () => _captionsOpen = !_captionsOpen,
                              ),
                              onMinimize: actions.minimize,
                              onEnd: _end,
                            )
                          else
                            AssistantLiveCallEndedActions(
                              failed: phase == AssistantLiveCallPhase.failed,
                              onCallAgain: actions.callAgain,
                              onClose: actions.minimize,
                            ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
