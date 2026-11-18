import 'package:flutter/material.dart';
import 'package:mobile/features/shell/view/readable_shell_title.dart';
import 'package:mobile/features/shell/view/shell_title_text_style.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

const double mobileSectionAppBarLogoSize = 26;
const double mobileSectionAppBarHeight = 46;
const EdgeInsets mobileSectionAppBarPadding = EdgeInsets.fromLTRB(16, 4, 16, 4);

/// Padding of the shell top bar: a 56dp bar at the default text size, with
/// the title at the gutter plus 4 and the trailing 44dp actions 8 from the
/// edge.
const EdgeInsets shellTopBarPadding = EdgeInsets.fromLTRB(20, 5, 8, 5);

/// [shellTopBarPadding] for a bar [width] wide; narrow phones (under 360dp)
/// keep the title at the plain gutter so trailing actions fit.
EdgeInsets shellTopBarPaddingFor(double width) => width < 360
    ? shellTopBarPadding.copyWith(left: 16, right: 4)
    : shellTopBarPadding;

/// Fit the scaled title line plus the brand control's vertical padding without
/// reducing accessibility text. Default text keeps the normal compact height.
double mobileSectionAppBarHeightFor(
  BuildContext context, {
  double minimumContentHeight = mobileSectionAppBarHeight,
}) {
  final painter = TextPainter(
    text: TextSpan(
      text: 'Ag',
      style: effectiveShellTitleStyle(
        context,
        style: Theme.of(
          context,
        ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700),
      ),
    ),
    textScaler: MediaQuery.textScalerOf(context),
    textDirection: Directionality.of(context),
    locale: Localizations.maybeLocaleOf(context),
    textAlign: DefaultTextStyle.of(context).textAlign ?? TextAlign.start,
    textWidthBasis: DefaultTextStyle.of(context).textWidthBasis,
    textHeightBehavior:
        DefaultTextStyle.of(context).textHeightBehavior ??
        DefaultTextHeightBehavior.maybeOf(context),
    maxLines: 1,
  )..layout();
  final titleHeight = painter.height + 16;
  painter.dispose();
  final minimum = minimumContentHeight > mobileSectionAppBarHeight
      ? minimumContentHeight
      : mobileSectionAppBarHeight;
  return titleHeight > minimum ? titleHeight.ceilToDouble() : minimum;
}

class MobileSectionAppBar extends StatelessWidget {
  const MobileSectionAppBar({
    this.title,
    this.titleWidget,
    super.key,
    this.actions = const [],
    this.leading = const [],
  });

  final String? title;
  final Widget? titleWidget;
  final List<Widget> actions;
  final List<Widget> leading;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final height = mobileSectionAppBarHeightFor(context);
    return shad.AppBar(
      height: height,
      padding: mobileSectionAppBarPadding,
      leadingGap: 8,
      trailingGap: 6,
      leading: leading,
      trailing: actions,
      child: SizedBox(
        height: height,
        child: Row(
          children: [
            Image.asset(
              'assets/logos/transparent.png',
              width: mobileSectionAppBarLogoSize,
              height: mobileSectionAppBarLogoSize,
              fit: BoxFit.contain,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Align(
                alignment: Alignment.centerLeft,
                child: DefaultTextStyle.merge(
                  style: theme.typography.large.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                  child: titleWidget ?? ReadableShellTitle(title ?? ''),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
