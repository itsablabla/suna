import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

// Middleware: refreshes Supabase session cookies (required for PKCE OAuth flow)
// but does NOT enforce authentication - all routes are publicly accessible.
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip middleware for static files
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // Block access to WIP /thread/new route - redirect to dashboard
  if (pathname.includes('/thread/new')) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // Create a response to pass through
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  // IMPORTANT: Refresh the Supabase session cookies.
  // This is required for the PKCE OAuth flow to work correctly.
  // @supabase/ssr stores the PKCE code verifier in a cookie, and this
  // middleware ensures those cookies are properly forwarded and refreshed.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh the session - this is what makes PKCE work
  // We don't use the result to enforce auth - just to refresh cookies
  await supabase.auth.getUser();

  // Allow everything through - no auth enforcement
  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
