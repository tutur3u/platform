'use client';

import { Eye, EyeOff, Lock } from '@tuturuuu/icons';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface PasswordFormProps {
  linkId: string;
  slug: string;
  hint: string | null;
}

export default function PasswordForm({
  linkId,
  slug,
  hint,
}: PasswordFormProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch('/api/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          linkId,
          slug,
          password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Incorrect password. Please try again.');
        return;
      }

      // Redirect to the destination URL
      if (data.url) {
        router.push(data.url);
      }
    } catch (err) {
      console.error('An error occurred while verifying the password.', err);
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-background to-muted/20 px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-md">
        <div className="rounded-lg bg-card p-8 shadow-lg">
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-dynamic-blue/10">
              <Lock className="h-6 w-6 text-dynamic-blue" />
            </div>
            <h1 className="mb-2 font-bold text-2xl text-foreground">
              Password Protected
            </h1>
            <p className="mb-6 text-muted-foreground">
              This link is password protected. Please enter the password to
              continue.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="password"
                className="block font-medium text-foreground/80 text-sm"
              >
                Password
              </label>
              <div className="relative mt-1">
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full rounded-md border border-border px-3 py-2 pr-10 shadow-sm focus:border-dynamic-blue focus:outline-none focus:ring-2 focus:ring-dynamic-blue focus:ring-offset-2"
                  placeholder="Enter password"
                  required
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground/60 hover:text-foreground/80"
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>
            </div>

            {hint && (
              <div className="rounded-md bg-dynamic-blue/10 p-3">
                <p className="text-dynamic-blue text-sm">
                  <span className="font-medium">Hint:</span> {hint}
                </p>
              </div>
            )}

            {error && (
              <div className="rounded-md bg-dynamic-red/10 p-3">
                <p className="text-dynamic-red text-sm">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !password}
              className="flex w-full justify-center rounded-md bg-dynamic-blue px-4 py-2 font-medium text-white transition-colors hover:bg-dynamic-blue/80 focus:outline-none focus:ring-2 focus:ring-dynamic-blue focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg
                    className="h-4 w-4 animate-spin"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Verifying...
                </span>
              ) : (
                'Continue'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
