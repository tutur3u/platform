import 'package:bloc_test/bloc_test.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mocktail/mocktail.dart';
import 'package:supabase_flutter/supabase_flutter.dart' show User;

class _Auth extends MockCubit<AuthState> implements AuthCubit {}

BlocProvider<AuthCubit> habitsAuthProvider() {
  FlutterSecureStorage.setMockInitialValues({});
  final auth = _Auth();
  when(() => auth.state).thenReturn(
    const AuthState.authenticated(
      User(
        id: 'user-1',
        appMetadata: {},
        userMetadata: {},
        aud: 'authenticated',
        createdAt: '2026-03-25T00:00:00Z',
      ),
    ),
  );
  when(() => auth.stream).thenAnswer((_) => const Stream.empty());
  return BlocProvider<AuthCubit>(create: (_) => auth);
}
