import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Auth removed - all routes are publicly accessible
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

  // Allow everything through - no auth required
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
