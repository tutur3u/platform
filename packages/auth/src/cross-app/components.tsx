'use client';

import { useCrossAppNavigation } from './hooks';
import { SupabaseClient } from '@supabase/supabase-js';
import { Database } from '@tuturuuu/types/supabase';
import React, { useCallback, useEffect, useState } from 'react';

interface CrossAppLinkProps {
  supabase: SupabaseClient<Database>;
  originApp: string;
  targetApp: string;
  targetAppUrl: string;
  targetPath: string;
  expirySeconds?: number;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
  onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
}

/**
 * A component that renders a link to another app with cross-app authentication
 */
export function CrossAppLink({
  supabase,
  originApp,
  targetApp,
  targetAppUrl,
  targetPath,
  expirySeconds = 300,
  className,
  style,
  children,
  onClick,
}: CrossAppLinkProps) {
  const [href, setHref] = useState<string>(`${targetAppUrl}${targetPath}`);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const { createLink } = useCrossAppNavigation(supabase, originApp);

  useEffect(() => {
    let isMounted = true;

    const generateLink = async () => {
      setIsLoading(true);
      try {
        const link = await createLink(
          targetAppUrl,
          targetPath,
          targetApp,
          expirySeconds
        );
        if (isMounted) {
          setHref(link);
          setIsLoading(false);
        }
      } catch (error) {
        console.error('Error generating cross-app link:', error);
        if (isMounted) {
          setHref(`${targetAppUrl}${targetPath}`);
          setIsLoading(false);
        }
      }
    };

    generateLink();

    return () => {
      isMounted = false;
    };
  }, [createLink, targetAppUrl, targetPath, targetApp, expirySeconds]);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      if (onClick) {
        onClick(e);
      }
    },
    [onClick]
  );

  return (
    <a
      href={href}
      className={className}
      style={{
        ...style,
        cursor: isLoading ? 'wait' : 'pointer',
        opacity: isLoading ? 0.7 : 1,
      }}
      onClick={handleClick}
      rel="noopener noreferrer"
    >
      {children}
    </a>
  );
}

interface CrossAppButtonProps {
  supabase: SupabaseClient<Database>;
  originApp: string;
  targetApp: string;
  targetAppUrl: string;
  targetPath: string;
  expirySeconds?: number;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
  disabled?: boolean;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
}

/**
 * A component that renders a button that navigates to another app with cross-app authentication
 */
export function CrossAppButton({
  supabase,
  originApp,
  targetApp,
  targetAppUrl,
  targetPath,
  expirySeconds = 300,
  className,
  style,
  children,
  disabled = false,
  onClick,
}: CrossAppButtonProps) {
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const { navigateTo } = useCrossAppNavigation(supabase, originApp);

  const handleClick = useCallback(
    async (e: React.MouseEvent<HTMLButtonElement>) => {
      if (onClick) {
        onClick(e);
      }

      if (!disabled && !isLoading) {
        setIsLoading(true);
        try {
          await navigateTo(targetAppUrl, targetPath, targetApp, expirySeconds);
        } catch (error) {
          console.error('Error navigating to cross app:', error);
          setIsLoading(false);
        }
      }
    },
    [
      onClick,
      disabled,
      isLoading,
      navigateTo,
      targetAppUrl,
      targetPath,
      targetApp,
      expirySeconds,
    ]
  );

  return (
    <button
      className={className}
      style={{
        ...style,
        cursor: disabled || isLoading ? 'not-allowed' : 'pointer',
        opacity: disabled || isLoading ? 0.7 : 1,
      }}
      onClick={handleClick}
      disabled={disabled || isLoading}
    >
      {children}
    </button>
  );
}
