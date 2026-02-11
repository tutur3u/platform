import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/apps/cubit/app_tab_cubit.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class AppsBackButton extends StatelessWidget {
  const AppsBackButton({super.key});

  @override
  Widget build(BuildContext context) {
    return shad.OutlineButton(
      density: shad.ButtonDensity.icon,
      onPressed: () {
        unawaited(context.read<AppTabCubit>().clearSelection());
        context.go(Routes.apps);
      },
      child: const Icon(Icons.arrow_back),
    );
  }
}
