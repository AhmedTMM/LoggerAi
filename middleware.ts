import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';

const ANONYMOUS_COOKIE = 'loggerai-anonymous-session';

export default auth((req) => {
  const { nextUrl } = req;
  const isLoggedIn = !!req.auth;
  const isAnonymous = req.cookies.get(ANONYMOUS_COOKIE)?.value === 'true';

  // Public routes that don't require authentication
  const publicRoutes = ['/login', '/api/auth'];
  const isPublicRoute = publicRoutes.some(route =>
    nextUrl.pathname.startsWith(route)
  );

  // Allow public routes
  if (isPublicRoute) {
    // Redirect to home if already logged in and trying to access login
    if ((isLoggedIn || isAnonymous) && nextUrl.pathname === '/login') {
      return NextResponse.redirect(new URL('/', nextUrl));
    }
    return NextResponse.next();
  }

  // Allow anonymous users to access the app
  if (isAnonymous) {
    // Add header to identify anonymous requests for API routes
    const response = NextResponse.next();
    response.headers.set('x-anonymous-mode', 'true');
    return response;
  }

  // Redirect to login if not authenticated
  if (!isLoggedIn) {
    const loginUrl = new URL('/login', nextUrl);
    loginUrl.searchParams.set('callbackUrl', nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (public folder)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
