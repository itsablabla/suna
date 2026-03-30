'use client';

import { useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';

// Auto-login: silently signs in on every page load using password auth
// This bypasses the magic link flow entirely
const SUNA_EMAIL = 'jadengarza@pm.me';
const SUNA_PASSWORD = 'SunaAutoLogin_vJTChr_NqR-TnHxUq8YyzA';

export function AutoLogin() {
  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const ensureLoggedIn = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          // Not logged in — sign in silently with password
          const { error } = await supabase.auth.signInWithPassword({
            email: SUNA_EMAIL,
            password: SUNA_PASSWORD,
          });
          if (!error) {
            // Redirect to dashboard if on auth page
            if (window.location.pathname === '/auth' || window.location.pathname === '/') {
              window.location.href = '/dashboard';
            }
          }
        }
      } catch (e) {
        // Fail silently
      }
    };

    ensureLoggedIn();
  }, []);

  return null;
}
