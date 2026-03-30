'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { KortixLoader } from '@/components/ui/kortix-loader'

/**
 * Auth Callback Page - Client Component
 *
 * This page handles the implicit flow case where Supabase redirects to
 * /auth/callback#access_token=... (hash-based tokens).
 *
 * The server-side route.ts handles code-based (PKCE) flows.
 * This client page handles hash-based (implicit) flows.
 *
 * When this page loads, it checks for #access_token in the URL hash,
 * calls supabase.auth.setSession() to establish the session, then
 * redirects to /dashboard.
 */
export default function AuthCallbackPage() {
  const router = useRouter()

  useEffect(() => {
    const hash = window.location.hash
    if (!hash || !hash.includes('access_token=')) {
      // No hash token - route.ts already handled the redirect, this is a fallback
      router.replace('/auth')
      return
    }

    const params = new URLSearchParams(hash.substring(1))
    const accessToken = params.get('access_token')
    const refreshToken = params.get('refresh_token')

    if (!accessToken || !refreshToken) {
      router.replace('/auth')
      return
    }

    const supabase = createClient()
    supabase.auth
      .setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(({ data, error }) => {
        if (error) {
          console.error('Failed to set session from hash token:', error)
          router.replace('/auth?error=' + encodeURIComponent(error.message))
        } else {
          // Session established - redirect to dashboard
          // Clear the hash from the URL for security
          window.history.replaceState(null, '', '/auth/callback')
          router.replace('/dashboard')
        }
      })
  }, [router])

  return (
    <div className="flex h-screen w-full items-center justify-center">
      <KortixLoader size="lg" />
    </div>
  )
}
