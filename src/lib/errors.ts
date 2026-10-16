import { NextResponse } from "next/server";

// Machine-readable errors: every failure tells an agent (or UI) what to do next.
export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public nextAction: string,
    public status = 400,
  ) {
    super(message);
  }
}

export function ok(data: unknown, status = 200) {
  return NextResponse.json({ success: true, data }, { status });
}

export function fail(e: unknown) {
  if (e instanceof AppError) {
    return NextResponse.json(
      { success: false, error: { code: e.code, message: e.message, next_action: e.nextAction } },
      { status: e.status },
    );
  }
  console.error(e);
  return NextResponse.json(
    { success: false, error: { code: "INTERNAL", message: e instanceof Error ? e.message : String(e), next_action: "retry" } },
    { status: 500 },
  );
}

export function route<T extends unknown[]>(fn: (...args: T) => Promise<Response>) {
  return async (...args: T) => {
    try {
      return await fn(...args);
    } catch (e) {
      return fail(e);
    }
  };
}
