import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Clears Supabase auth cookies set by middleware / SSR.
 * Browser-only signOut can leave sessions alive; this runs on the server with the same cookie jar.
 */
export async function POST(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url?.trim() || !key?.trim()) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 500 });
  }

  const response = NextResponse.json({ ok: true });

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const { error } = await supabase.auth.signOut({ scope: "global" });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return response;
}
