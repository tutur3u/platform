import 'package:flutter/material.dart';
import 'package:mobile/core/layout/grouped_rows.dart';
import 'package:mobile/core/ui/kit/illustration/illustration_painter.dart';
import 'package:mobile/core/ui/kit/illustration/illustration_palette.dart';

export 'package:mobile/core/ui/kit/illustration/illustration_palette.dart';

/// The scenes [AppIllustration] can draw.
enum AppIllustrationKind {
  notificationsClear,
  noTasks,
  noTransactions,
  noBudgets,
  wallet,
  searchNoResults,
  offline,
  calendarFree,
  conversations,

  /// Multi-hue sign-in scenes; see `illustration_scenes_auth.dart`.
  welcomeBowl,
  emailCode,
  twoStep,
  passkey,
  accounts,
  locked;

  /// The sign-in scenes draw their own hue backdrop on a wider view box
  /// and ignore [AppIllustration.tone].
  bool get isAuthScene => index >= welcomeBowl.index;
}

/// Small vector illustration for empty, offline, error and sign-in states.
///
/// Every colour comes from the appearance tokens through [tone], so the
/// drawing follows Classic and Sorbet in light and dark. The scene loops for
/// [cycles] gentle passes after it appears and then rests on its first pose;
/// under reduced motion it never moves. Painting runs behind a repaint
/// boundary and never rebuilds the surrounding page.
class AppIllustration extends StatefulWidget {
  const AppIllustration(
    this.kind, {
    this.size = 120,
    this.tone = AppTone.primary,
    this.cycles = 3,
    super.key,
  });

  final AppIllustrationKind kind;

  /// Width; the classic scenes are square, sign-in scenes keep their
  /// view box ratio.
  final double size;
  final AppTone tone;

  /// Loop passes played after the illustration appears; 0 keeps it still.
  final int cycles;

  static const period = Duration(milliseconds: 3600);

  @override
  State<AppIllustration> createState() => _AppIllustrationState();
}

/// Height over width: sign-in scenes are wider than tall.
double _aspect(AppIllustrationKind kind) => switch (kind) {
  AppIllustrationKind.welcomeBowl => 280 / 320,
  _ when kind.isAuthScene => 160 / 200,
  _ => 1,
};

class _AppIllustrationState extends State<AppIllustration>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: AppIllustration.period,
  );
  var _played = 0;

  @override
  void initState() {
    super.initState();
    _controller.addStatusListener(_onStatus);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (MediaQuery.disableAnimationsOf(context) || widget.cycles <= 0) {
      _controller
        ..stop()
        ..value = 0;
    } else if (!_controller.isAnimating && _played < widget.cycles) {
      _controller.forward(from: _controller.value);
    }
  }

  void _onStatus(AnimationStatus status) {
    if (status != AnimationStatus.completed || !mounted) return;
    _played++;
    if (_played < widget.cycles && !MediaQuery.disableAnimationsOf(context)) {
      _controller.forward(from: 0);
    } else {
      _controller.value = 0;
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final palette = AppIllustrationPalette.of(context, widget.tone);
    return ExcludeSemantics(
      child: RepaintBoundary(
        child: SizedBox(
          width: widget.size,
          height: widget.size * _aspect(widget.kind),
          child: CustomPaint(
            painter: AppIllustrationPainter(
              kind: widget.kind,
              palette: palette,
              progress: _controller,
            ),
          ),
        ),
      ),
    );
  }
}
