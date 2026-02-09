import 'dart:async';

import 'package:flutter/material.dart'
    hide AppBar, FilledButton, Scaffold, TextButton, TextField;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class SignUpPage extends StatefulWidget {
  const SignUpPage({super.key});

  @override
  State<SignUpPage> createState() => _SignUpPageState();
}

class _SignUpPageState extends State<SignUpPage> {
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _confirmPasswordController = TextEditingController();
  final _formKey = GlobalKey<FormState>();
  bool _signUpSuccess = false;

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    _confirmPasswordController.dispose();
    super.dispose();
  }

  String? _validatePassword(String password) {
    if (password.length < 8) return context.l10n.signUpPasswordMinLength;
    if (!password.contains(RegExp('[A-Z]'))) {
      return context.l10n.signUpPasswordUppercase;
    }
    if (!password.contains(RegExp('[a-z]'))) {
      return context.l10n.signUpPasswordLowercase;
    }
    if (!password.contains(RegExp('[0-9]'))) {
      return context.l10n.signUpPasswordNumber;
    }
    return null;
  }

  Future<void> _handleSignUp() async {
    // Validate all FormFields by accessing the Form state
    final formState = _formKey.currentState;
    if (formState == null) return;

    // Trigger validation - this will cause FormField validators to run
    // and display any validation errors
    if (!formState.validate()) return;

    final email = _emailController.text.trim();
    final password = _passwordController.text;

    if (email.isEmpty) return;

    final success = await context.read<AuthCubit>().signUp(email, password);
    if (success && mounted) {
      setState(() => _signUpSuccess = true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;

    if (_signUpSuccess) {
      return shad.Scaffold(
        headers: [
          shad.AppBar(
            leading: [
              shad.OutlineButton(
                density: shad.ButtonDensity.icon,
                onPressed: () => context.go('/login'),
                child: const Icon(Icons.arrow_back),
              ),
            ],
          ),
        ],
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  Icons.mark_email_read_outlined,
                  size: 64,
                  color: shad.Theme.of(context).colorScheme.primary,
                ),
                const shad.Gap(16),
                Text(
                  l10n.signUpSuccessTitle,
                  style: shad.Theme.of(context).typography.h3,
                  textAlign: TextAlign.center,
                ),
                const shad.Gap(8),
                Text(
                  l10n.signUpSuccessMessage,
                  style: shad.Theme.of(context).typography.p,
                  textAlign: TextAlign.center,
                ),
                const shad.Gap(24),
                shad.PrimaryButton(
                  onPressed: () => context.go('/login'),
                  child: Text(l10n.signUpBackToLogin),
                ),
              ],
            ),
          ),
        ),
      );
    }

    return shad.Scaffold(
      headers: [
        shad.AppBar(
          title: Text(l10n.signUpTitle),
        ),
      ],
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: BlocBuilder<AuthCubit, AuthState>(
            buildWhen: (prev, curr) =>
                prev.isLoading != curr.isLoading || prev.error != curr.error,
            builder: (context, state) {
              return shad.Form(
                key: _formKey,
                child: ListView(
                  children: [
                    const shad.Gap(32),
                    shad.FormField(
                      key: const shad.FormKey<String>(#signUpEmail),
                      label: Text(l10n.emailLabel),
                      child: shad.TextField(
                        controller: _emailController,
                        hintText: l10n.emailLabel,
                        keyboardType: TextInputType.emailAddress,
                        textInputAction: TextInputAction.next,
                      ),
                    ),
                    const shad.Gap(16),
                    shad.FormField(
                      key: const shad.FormKey<String>(#signUpPassword),
                      label: Text(l10n.passwordLabel),
                      validator:
                          ((value) =>
                                  _validatePassword(_passwordController.text))
                              as shad.Validator<String>?,
                      child: shad.TextField(
                        controller: _passwordController,
                        hintText: l10n.passwordLabel,
                        obscureText: true,
                        textInputAction: TextInputAction.next,
                      ),
                    ),
                    const shad.Gap(16),
                    shad.FormField(
                      key: const shad.FormKey<String>(#signUpConfirmPassword),
                      label: Text(l10n.signUpConfirmPassword),
                      validator:
                          ((value) {
                                if (_confirmPasswordController.text !=
                                    _passwordController.text) {
                                  return context.l10n.signUpPasswordMismatch;
                                }
                                return null;
                              })
                              as shad.Validator<String>?,
                      child: shad.TextField(
                        controller: _confirmPasswordController,
                        hintText: l10n.signUpConfirmPassword,
                        obscureText: true,
                        textInputAction: TextInputAction.done,
                        onSubmitted: (_) => _handleSignUp(),
                      ),
                    ),
                    if (state.error != null) ...[
                      const shad.Gap(16),
                      Text(
                        state.error!,
                        style: TextStyle(
                          color: shad.Theme.of(context).colorScheme.destructive,
                        ),
                        textAlign: TextAlign.center,
                      ),
                    ],
                    const shad.Gap(24),
                    shad.PrimaryButton(
                      onPressed: state.isLoading ? null : _handleSignUp,
                      child: state.isLoading
                          ? const shad.CircularProgressIndicator(size: 20)
                          : Text(l10n.signUpButton),
                    ),
                  ],
                ),
              );
            },
          ),
        ),
      ),
    );
  }
}
