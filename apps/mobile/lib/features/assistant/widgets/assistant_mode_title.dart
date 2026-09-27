import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/features/assistant/cubit/assistant_chrome_cubit.dart';
import 'package:mobile/l10n/l10n.dart';

/// Keeps the Assistant title in sync with its Chat and Live modes.
class AssistantModeTitle extends StatefulWidget {
  const AssistantModeTitle({super.key});

  @override
  State<AssistantModeTitle> createState() => _AssistantModeTitleState();
}

class _AssistantModeTitleState extends State<AssistantModeTitle> {
  static const _suffixDelay = Duration(milliseconds: 1450);
  Timer? _suffixTimer;
  bool _showSuffix = false;
  bool? _modeIsLive;

  @override
  void initState() {
    super.initState();
    final chrome = context.read<AssistantChromeCubit>().state;
    if (chrome.hasSelectedMode) _modeIsLive = chrome.isLiveMode;
  }

  @override
  void dispose() {
    _suffixTimer?.cancel();
    super.dispose();
  }

  void _onChromeChanged(AssistantChromeState state) {
    if (!state.hasSelectedMode || _modeIsLive == state.isLiveMode) return;
    _suffixTimer?.cancel();
    setState(() {
      _modeIsLive = state.isLiveMode;
      _showSuffix = true;
    });
    _suffixTimer = Timer(_suffixDelay, () {
      if (mounted) setState(() => _showSuffix = false);
    });
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final baseStyle = Theme.of(
      context,
    ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700);
    final mode = _modeIsLive;
    final modeLabel = mode == null
        ? context.l10n.navAssistant
        : mode
        ? context.l10n.commonLive
        : context.l10n.chatTitle;
    final modeColor = mode == null
        ? scheme.onSurface
        : mode
        ? scheme.tertiary
        : scheme.primary;

    return BlocListener<AssistantChromeCubit, AssistantChromeState>(
      listenWhen: (previous, current) =>
          previous.hasSelectedMode != current.hasSelectedMode ||
          previous.isLiveMode != current.isLiveMode,
      listener: (_, state) => _onChromeChanged(state),
      child: SizedBox(
        height: 48,
        child: Row(
          children: [
            Image.asset('assets/logos/transparent.png', width: 28, height: 28),
            const SizedBox(width: 10),
            Flexible(
              child: ClipRect(
                child: AnimatedSize(
                  duration: const Duration(milliseconds: 260),
                  curve: Curves.easeOutCubic,
                  alignment: Alignment.centerLeft,
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Flexible(
                        child: _SlotWord(
                          text: modeLabel,
                          style: baseStyle?.copyWith(color: modeColor),
                        ),
                      ),
                      if (mode != null)
                        AnimatedSize(
                          duration: const Duration(milliseconds: 260),
                          curve: Curves.easeOutCubic,
                          child: AnimatedOpacity(
                            duration: const Duration(milliseconds: 180),
                            opacity: _showSuffix ? 1 : 0,
                            child: _showSuffix
                                ? Text(
                                    ' ${context.l10n.navAssistant}',
                                    maxLines: 1,
                                    style: baseStyle,
                                  )
                                : const SizedBox.shrink(),
                          ),
                        ),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SlotWord extends StatelessWidget {
  const _SlotWord({required this.text, required this.style});

  final String text;
  final TextStyle? style;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        for (var index = 0; index < text.length; index++)
          AnimatedSwitcher(
            duration: Duration(milliseconds: 180 + index * 12),
            switchInCurve: Curves.easeOutCubic,
            switchOutCurve: Curves.easeInCubic,
            transitionBuilder: (child, animation) => FadeTransition(
              opacity: animation,
              child: SlideTransition(
                position: Tween<Offset>(
                  begin: const Offset(0, 0.28),
                  end: Offset.zero,
                ).animate(animation),
                child: child,
              ),
            ),
            child: Text(
              text[index],
              key: ValueKey('$index:${text[index]}'),
              style: style,
              maxLines: 1,
            ),
          ),
      ],
    );
  }
}
