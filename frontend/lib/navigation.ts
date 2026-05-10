/**
 * Full-page navigation after auth. Next.js `router.push` / `router.replace` plus
 * `router.refresh()` can leave the UI stuck on "Signing in…" / "Completing sign-in…"
 * even when Supabase already has a valid session.
 */
export function hardNavigate(pathOrUrl: string) {
  if (typeof window === "undefined") return;

  if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")) {
    window.location.assign(pathOrUrl);
    return;
  }

  const path = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  window.location.assign(`${window.location.origin}${path}`);
}
