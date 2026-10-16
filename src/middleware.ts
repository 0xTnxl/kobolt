import { NextRequest, NextResponse } from "next/server";

// Real money moves on mainnet: gate the app behind a passcode.
// Public: portfolio pages/API, Paj webhook, unlock page.
const PUBLIC = [/^\/unlock/, /^\/api\/auth/, /^\/api\/webhooks\//, /^\/api\/portfolio\//, /^\/p\//, /^\/pay\//, /^\/api\/pay\//, /^\/_next\//, /^\/favicon/];

export function middleware(req: NextRequest) {
  const pass = process.env.APP_PASSCODE;
  if (!pass) return NextResponse.next();
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((r) => r.test(pathname))) return NextResponse.next();
  if (req.cookies.get("kb_pass")?.value === pass) return NextResponse.next();
  if (pathname.startsWith("/api/"))
    return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED", message: "Passcode required", next_action: "unlock" } }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/unlock";
  url.search = `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/((?!_next/static|_next/image).*)"] };
