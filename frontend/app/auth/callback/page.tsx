"use client";

/**
 * Client-side OAuth / email-confirmation callback.
 * Completes the PKCE exchange in the browser (same cookie jar as sign-up) and
 * dedupes concurrent calls so React Strict Mode cannot consume the code twice.
 */

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";

import { createBrowserSupabaseClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { hardNavigate } from "@/lib/navigation";

/** One in-flight exchange per auth code (survives Strict Mode double-mount). */
const pkceExchange = new Map<string, Promise<{ error: { message: string } | null }>>();

function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/profile/setup";
  return raw;
}

function isPkceVerifierIssue(message: string): boolean {
  return /code verifier|both auth code|non-empty/i.test(message);
}

function CallbackInner() {
  const searchParams = useSearchParams();
  const code = searchParams.get("code");
  const nextRaw = searchParams.get("next");

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      hardNavigate("/login?error=config");
      return;
    }

    if (!code) {
      hardNavigate(
        `/login?error=auth&reason=${encodeURIComponent(
          "Missing confirmation code. Open the email link in the same browser where you started sign-up, or add http://localhost:3000/auth/callback to Supabase Auth redirect URLs.",
        )}`,
      );
      return;
    }

    let promise = pkceExchange.get(code);
    if (!promise) {
      const supabase = createBrowserSupabaseClient();
      promise = supabase.auth.exchangeCodeForSession(code).then((result) => ({
        error: result.error,
      }));
      pkceExchange.set(code, promise);
      promise.finally(() => {
        pkceExchange.delete(code);
      });
    }

    void promise.then(({ error }) => {
      if (error) {
        // Email confirmation can still succeed even when PKCE verifier is missing
        // (e.g. link opened in a different browser/mail app). In that case, send user
        // to login with a neutral success hint instead of a scary auth error.
        if (isPkceVerifierIssue(error.message)) {
          hardNavigate(`/login?confirmed=1&next=${encodeURIComponent(safeNext(nextRaw))}`);
          return;
        }
        hardNavigate(`/login?error=auth&reason=${encodeURIComponent(error.message)}`);
        return;
      }
      hardNavigate(safeNext(nextRaw));
    });
  }, [code, nextRaw]);

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/30 px-4">
      <p className="text-muted-foreground text-sm">Completing sign-in…</p>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-svh items-center justify-center bg-muted/30 px-4">
          <p className="text-muted-foreground text-sm">Completing sign-in…</p>
        </div>
      }
    >
      <CallbackInner />
    </Suspense>
  );
}
