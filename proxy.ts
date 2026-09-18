import { NextRequest, NextResponse } from 'next/server';
import {
  HOST_SESSION_COOKIE,
  verifyHostSessionToken,
} from './lib/hostAuth';

export async function proxy(request: NextRequest) {
  const sessionToken = request.cookies.get(HOST_SESSION_COOKIE)?.value;

  if (!sessionToken || !(await verifyHostSessionToken(sessionToken))) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/host/:path*'],
};
