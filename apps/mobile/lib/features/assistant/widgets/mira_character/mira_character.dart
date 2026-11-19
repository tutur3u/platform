import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';
import 'package:mobile/features/assistant/widgets/mira_character/mira_character_painter.dart';

/// Mira as a small animated character built from the mark's petals.
///
/// It breathes, sways its petals and blinks for a short while after it
/// appears, spins its petals while [thinking], and bounces when tapped. One
/// controller drives the painter behind a repaint boundary, so animating never
/// rebuilds the page. Under reduced motion it holds a still pose.
class MiraCharacter extends StatefulWidget {
  const MiraCharacter({this.size = 128, this.thinking = false, super.key});

  final double size;
  final bool thinking;

  /// How long the idle animation plays before Mira rests.
  static const idleBudget = Duration(seconds: 8);

  @override
  State<MiraCharacter> createState() => _MiraCharacterState();
}

class _MiraCharacterState extends State<MiraCharacter>
    with SingleTickerProviderStateMixin {
  final _motion = MiraMotion();
  late final AnimationController _clock = AnimationController(
    vsync: this,
    duration: const Duration(seconds: 1),
  )..addListener(_tick);
  Duration _last = Duration.zero;
  double _awake = 0;
  bool _reduced = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _reduced = MediaQuery.disableAnimationsOf(context);
    if (_reduced) {
      _rest();
    } else {
      _wake();
    }
  }

  @override
  void didUpdateWidget(MiraCharacter oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.thinking != widget.thinking && !_reduced) _wake();
  }

  void _wake() {
    _awake = 0;
    if (_clock.isAnimating) return;
    _last = Duration.zero;
    _clock.repeat();
  }

  void _rest() {
    _clock.stop();
    _motion.rest();
  }

  void _tick() {
    final elapsed = _clock.lastElapsedDuration ?? Duration.zero;
    final dt = math.max(0, (elapsed - _last).inMicroseconds) / 1e6;
    _last = elapsed;
    _awake += dt;
    final budget = MiraCharacter.idleBudget.inMicroseconds / 1e6;
    final winding = !widget.thinking && _awake >= budget;
    _motion.advance(
      math.min(dt, 0.05),
      thinking: widget.thinking,
      winding: winding,
    );
    if (winding && _motion.settled) _rest();
  }

  void _poke() {
    if (_reduced) return;
    _motion.poke();
    _wake();
  }

  @override
  void dispose() {
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
                ink: colors.foreground,
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
  double _spinSpeed = 0;
  bool thinking = false;

  /// Tap excitement from 1 down to 0.
  double burst = 0;

  /// 0 holds the still pose; 1 plays the full idle motion.
  double liveliness = 0;

  bool get settled => liveliness < 0.01 && burst == 0 && _spinSpeed < 0.01;

  /// Moves the pose on by [dt] seconds. [winding] eases every motion out so
  /// the character can come to rest.
  void advance(double dt, {required bool thinking, required bool winding}) {
    time += dt;
    this.thinking = thinking;
    final targetSpeed = thinking ? 5.5 : (winding ? 0.0 : 0.3);
    _spinSpeed += (targetSpeed - _spinSpeed) * math.min(1, dt * 2.5);
    burst = math.max(0, burst - dt * 1.4);
    spin = (spin + (_spinSpeed + burst * 10) * dt) % (2 * math.pi);
    final targetLife = winding ? 0.0 : 1.0;
    liveliness += (targetLife - liveliness) * math.min(1, dt * 2);
    notifyListeners();
  }

  void poke() {
    burst = 1;
    notifyListeners();
  }

  /// Holds the still pose; the petal ring keeps its current angle.
  void rest() {
    thinking = false;
    _spinSpeed = 0;
    burst = 0;
    liveliness = 0;
    notifyListeners();
  }
}
