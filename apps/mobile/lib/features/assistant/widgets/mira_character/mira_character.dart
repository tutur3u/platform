import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';
import 'package:mobile/features/assistant/widgets/mira_character/mira_character_painter.dart';

/// Mira breathes, sways and blinks while visible. Animation drives the
/// isolated painter directly, so neither the hero nor the page rebuilds.
class MiraCharacter extends StatefulWidget {
  const MiraCharacter({
    this.size = 128,
    this.thinking = false,
    this.listening = false,
    super.key,
  });

  final double size;
  final bool thinking;
  final bool listening;

  @override
  State<MiraCharacter> createState() => _MiraCharacterState();
}

class _MiraCharacterState extends State<MiraCharacter>
    with SingleTickerProviderStateMixin, WidgetsBindingObserver {
  static const _reducedStep = Duration(milliseconds: 160);
  final _motion = MiraMotion();
  late final AnimationController _clock = AnimationController(
    vsync: this,
    duration: const Duration(seconds: 1),
    animationBehavior: AnimationBehavior.preserve,
  )..addListener(_tick);
  Timer? _reducedLoop;
  Duration _last = Duration.zero;
  bool _reduced = false;
  bool _visible = false;
  bool _foreground = true;

  @override
  void initState() {
    super.initState();
    final binding = WidgetsBinding.instance;
    final lifecycle = binding.lifecycleState;
    _foreground = lifecycle == null || lifecycle == AppLifecycleState.resumed;
    binding.addObserver(this);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _visible = TickerMode.valuesOf(context).enabled;
    _reduced = MediaQuery.disableAnimationsOf(context);
    _updateLoop();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    _foreground = state == AppLifecycleState.resumed;
    _updateLoop();
  }

  void _updateLoop() {
    if (!_visible || !_foreground || _reduced) {
      _clock.stop();
    } else if (!_clock.isAnimating) {
      _last = Duration.zero;
      unawaited(_clock.repeat());
    }

    if (_visible && _foreground && _reduced) {
      // Subpixel breathing needs fewer paints than the full petal animation.
      _reducedLoop ??= Timer.periodic(_reducedStep, (_) => _step(_reducedStep));
    } else {
      _reducedLoop?.cancel();
      _reducedLoop = null;
    }
  }

  void _tick() {
    final elapsed = _clock.lastElapsedDuration ?? Duration.zero;
    final delta = elapsed - _last;
    _last = elapsed;
    _step(delta);
  }

  void _step(Duration delta) {
    _motion.advance(
      (delta.inMicroseconds / Duration.microsecondsPerSecond).clamp(0.0, 0.16),
      thinking: widget.thinking,
      listening: widget.listening,
      reduced: _reduced,
    );
  }

  void _poke() {
    if (!_reduced) _motion.poke();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _reducedLoop?.cancel();
    _clock.dispose();
    _motion.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = AppTokens.of(context).colorScheme;
    return ExcludeSemantics(
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: _poke,
        child: RepaintBoundary(
          child: SizedBox.square(
            dimension: widget.size,
            child: CustomPaint(
              painter: MiraCharacterPainter(
                motion: _motion,
                face: colors.card,
                shade: colors.muted,
                ink: colors.cardForeground,
                outline: colors.border,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Time-integrated pose of [MiraCharacter]; the painter listens to it.
class MiraMotion extends ChangeNotifier {
  double time = 0;
  double spin = 0;
  double petalPhase = 0;
  double _spinSpeed = 0;
  double attention = 0;
  double burst = 0;
  double liveliness = 0;
  bool thinking = false;
  bool listening = false;

  void advance(
    double dt, {
    required bool thinking,
    required bool listening,
    required bool reduced,
  }) {
    time += dt;
    liveliness = reduced ? 0.16 : 1;
    this.thinking = thinking && !reduced;
    this.listening = listening && !reduced;
    final targetAttention = this.thinking || this.listening ? 1.0 : 0.0;
    attention += (targetAttention - attention) * math.min(1, dt * 3);
    petalPhase = (petalPhase + dt * (1.8 + attention)) % (2 * math.pi);
    final targetSpeed = this.thinking ? 0.8 : 0.0;
    _spinSpeed = reduced
        ? 0
        : _spinSpeed + (targetSpeed - _spinSpeed) * math.min(1, dt * 3);
    burst = reduced ? 0 : math.max(0, burst - dt * 1.4);
    spin = (spin + (_spinSpeed + burst * 3) * dt) % (2 * math.pi);
    notifyListeners();
  }

  void poke() {
    burst = 1;
    notifyListeners();
  }
}
