import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { passcode } = await req.json().catch(() => ({}));
  if (!process.env.APP_PASSCODE || passcode !== process.env.APP_PASSCODE)
    return NextResponse.json({ success: false, error: { code: "BAD_PASSCODE", message: "Wrong passcode", next_action: "retry" } }, { status: 401 });
  const res = NextResponse.json({ success: true });
  res.cookies.set("kb_pass", passcode, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 3, path: "/" });
  return res;
}
