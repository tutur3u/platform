import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/shell/view/avatar_dropdown.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class MobileSectionAppBar extends StatelessWidget {
  const MobileSectionAppBar({
    required this.title,
    super.key,
    this.actions = const [],
  });

  final String title;
  final List<Widget> actions;

  @override
  Widget build(BuildContext context) {
    var hasAuthCubit = true;
    try {
      context.read<AuthCubit>();
    } on Exception {
      hasAuthCubit = false;
    }

    return shad.AppBar(
      title: Text(title),
      trailing: [
        ...actions,
        if (hasAuthCubit) const AvatarDropdown(),
      ],
    );
  }
}
