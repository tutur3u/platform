import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/shell/view/avatar_dropdown.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

const double mobileSectionAppBarLogoSize = 26;
const double mobileSectionAppBarHeight = 46;
const EdgeInsets mobileSectionAppBarPadding = EdgeInsets.fromLTRB(
  16,
  10,
  16,
  10,
);

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
    var hasAuthCubit = true;
    final theme = shad.Theme.of(context);
    try {
      context.read<AuthCubit>();
    } on Exception {
      hasAuthCubit = false;
    }

    return shad.AppBar(
      height: mobileSectionAppBarHeight,
      padding: mobileSectionAppBarPadding,
      leadingGap: 8,
      trailingGap: 6,
      leading: leading,
      trailing: [
        ...actions,
        if (hasAuthCubit)
          const KeyedSubtree(
            key: ValueKey('section-avatar'),
            child: RepaintBoundary(child: AvatarDropdown()),
          ),
      ],
      child: SizedBox(
        height: mobileSectionAppBarHeight,
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
                  child:
                      titleWidget ??
                      Text(
                        title ?? '',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
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
