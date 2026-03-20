import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/shell/view/avatar_dropdown.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

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
      leading: leading,
      title: Row(
        children: [
          Image.asset(
            'assets/logos/transparent.png',
            width: 24,
            height: 24,
            fit: BoxFit.contain,
          ),
          const SizedBox(width: 10),
          Flexible(
            child:
                titleWidget ??
                Text(
                  title ?? '',
                  overflow: TextOverflow.ellipsis,
                  style: theme.typography.large.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
          ),
        ],
      ),
      trailing: [
        ...actions,
        if (hasAuthCubit) const AvatarDropdown(),
      ],
    );
  }
}
