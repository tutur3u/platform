import type { AuthError, Session, User } from '@supabase/supabase-js';
import { create } from 'zustand';

import { supabase } from '../supabase/client';

type AuthState = {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  isInitialized: boolean;
  error: AuthError | null;
};

type AuthActions = {
  // Initialization
  initialize: () => Promise<void>;

  // Email auth
  signInWithEmail: (
    email: string,
    password: string
  ) => Promise<{ success: boolean; error?: AuthError }>;
  signUpWithEmail: (
    email: string,
    password: string
  ) => Promise<{ success: boolean; error?: AuthError }>;

  // OAuth
  signInWithGoogle: () => Promise<{ success: boolean; error?: AuthError }>;
  signInWithApple: () => Promise<{ success: boolean; error?: AuthError }>;

  // Password recovery
  resetPassword: (
    email: string
  ) => Promise<{ success: boolean; error?: AuthError }>;
  updatePassword: (
    newPassword: string
  ) => Promise<{ success: boolean; error?: AuthError }>;

  // Session management
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;

  // State updates
  setUser: (user: User | null) => void;
  setSession: (session: Session | null) => void;
  setError: (error: AuthError | null) => void;
  clearError: () => void;
};

export type AuthStore = AuthState & AuthActions;

/**
 * Auth store for managing user authentication state
 *
 * Uses Zustand for global state management with Supabase auth.
 * The store is initialized on app start and listens for auth state changes.
 *
 * @example
 * ```typescript
 * import { useAuthStore } from '@/lib/stores/auth-store';
 *
 * function MyComponent() {
 *   const { user, isLoading, signInWithEmail } = useAuthStore();
 *
 *   if (isLoading) return <LoadingSpinner />;
 *   if (!user) return <LoginScreen />;
 *
 *   return <HomeScreen user={user} />;
 * }
 * ```
 */
export const useAuthStore = create<AuthStore>((set, _get) => ({
  // Initial state
  user: null,
  session: null,
  isLoading: true,
  isInitialized: false,
  error: null,

  // Initialize auth state and listen for changes
  initialize: async () => {
    try {
      // Get current session
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();

      if (error) {
        set({ error, isLoading: false, isInitialized: true });
        return;
      }

      set({
        session,
        user: session?.user ?? null,
        isLoading: false,
        isInitialized: true,
      });

      // Listen for auth state changes
      supabase.auth.onAuthStateChange((_event, session) => {
        set({
          session,
          user: session?.user ?? null,
          error: null,
        });
      });
    } catch (error) {
      set({
        error: error as AuthError,
        isLoading: false,
        isInitialized: true,
      });
    }
  },

  // Email/password sign in
  signInWithEmail: async (email: string, password: string) => {
    set({ isLoading: true, error: null });

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      set({ error, isLoading: false });
      return { success: false, error };
    }

    set({
      session: data.session,
      user: data.user,
      isLoading: false,
    });

    return { success: true };
  },

  // Email/password sign up
  signUpWithEmail: async (email: string, password: string) => {
    set({ isLoading: true, error: null });

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      set({ error, isLoading: false });
      return { success: false, error };
    }

    // Note: User might need to verify email depending on Supabase settings
    set({
      session: data.session,
      user: data.user,
      isLoading: false,
    });

    return { success: true };
  },

  // Google OAuth
  signInWithGoogle: async () => {
    set({ isLoading: true, error: null });

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        skipBrowserRedirect: true, // Handle redirect manually for native
      },
    });

    if (error) {
      set({ error, isLoading: false });
      return { success: false, error };
    }

    set({ isLoading: false });
    return { success: true };
  },

  // Apple OAuth (iOS only)
  signInWithApple: async () => {
    set({ isLoading: true, error: null });

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'apple',
      options: {
        skipBrowserRedirect: true,
      },
    });

    if (error) {
      set({ error, isLoading: false });
      return { success: false, error };
    }

    set({ isLoading: false });
    return { success: true };
  },

  // Password reset request
  resetPassword: async (email: string) => {
    set({ isLoading: true, error: null });

    const { error } = await supabase.auth.resetPasswordForEmail(email);

    if (error) {
      set({ error, isLoading: false });
      return { success: false, error };
    }

    set({ isLoading: false });
    return { success: true };
  },

  // Update password (when user has reset token)
  updatePassword: async (newPassword: string) => {
    set({ isLoading: true, error: null });

    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) {
      set({ error, isLoading: false });
      return { success: false, error };
    }

    set({ isLoading: false });
    return { success: true };
  },

  // Sign out
  signOut: async () => {
    set({ isLoading: true });

    await supabase.auth.signOut();

    set({
      user: null,
      session: null,
      isLoading: false,
      error: null,
    });
  },

  // Refresh session manually
  refreshSession: async () => {
    const {
      data: { session },
      error,
    } = await supabase.auth.refreshSession();

    if (error) {
      set({ error });
      return;
    }

    set({
      session,
      user: session?.user ?? null,
    });
  },

  // Direct state setters
  setUser: (user) => set({ user }),
  setSession: (session) => set({ session }),
  setError: (error) => set({ error }),
  clearError: () => set({ error: null }),
}));

/**
 * Selector hooks for common auth state
 */
export const useUser = () => useAuthStore((state) => state.user);
export const useSession = () => useAuthStore((state) => state.session);
export const useIsAuthenticated = () =>
  useAuthStore((state) => !!state.session);
export const useAuthLoading = () => useAuthStore((state) => state.isLoading);
export const useAuthError = () => useAuthStore((state) => state.error);
