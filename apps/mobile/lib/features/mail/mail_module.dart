import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/apps/models/app_module.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/mail/view/mail_page.dart';
import 'package:mobile/l10n/l10n.dart';

const mailModule = AppModule(
  id: 'mail',
  route: Routes.mail,
  icon: Icons.mail_outline,
  labelBuilder: _label,
  pageBuilder: _page,
  isVisible: _visible,
  miniAppNavItems: [
    MiniAppNavItem(
      id: 'mail_inbox',
      route: Routes.mail,
      icon: Icons.inbox_outlined,
      labelBuilder: _label,
    ),
  ],
);

String _label(AppLocalizations l10n) => l10n.mailTitle;
Widget _page(BuildContext context) => const MailPage();
bool _visible(BuildContext context) {
  final email = context.select<AuthCubit?, String?>(
    (cubit) => cubit?.state.user?.email,
  );
  return email?.toLowerCase().endsWith('@tuturuuu.com') ?? false;
}
