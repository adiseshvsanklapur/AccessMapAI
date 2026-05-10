"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";

import type { UserProfileRow } from "@/lib/profile-types";
import { hardNavigate } from "@/lib/navigation";
import { createBrowserSupabaseClient, isSupabaseConfigured } from "@/lib/supabase/client";

type AuthContextValue = {
  configured: boolean;
  ready: boolean;
  user: User | null;
  profile: UserProfileRow | null;
  /** Set when the last profile fetch failed or timed out; does not clear `profile` so UI stays stable. */
  profileFetchError: string | null;
  signingOut: boolean;
  refreshProfile: () => Promise<void>;
  mergeLocalProfile: (partial: Partial<UserProfileRow>) => void;
  signOut: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const configured = isSupabaseConfigured();
  const [ready, setReady] = useState(false);
  const [profileFetchDone, setProfileFetchDone] = useState(false);
  const [profileFetchError, setProfileFetchError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfileRow | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const signOutLock = useRef(false);

  const mergeLocalProfile = useCallback(
    (partial: Partial<UserProfileRow>) => {
      if (!user) return;
      const now = new Date().toISOString();
      setProfile((prev) => {
        if (!prev) {
          return {
            id: user.id,
            email: user.email ?? null,
            full_name: null,
            routing_profile: "wheelchair",
            mobility_notes: null,
            sensory_notes: null,
            additional_needs: null,
            onboarding_completed: false,
            created_at: now,
            updated_at: now,
            ...partial,
          } as UserProfileRow;
        }
        return { ...prev, ...partial, updated_at: now };
      });
      setProfileFetchError(null);
    },
    [user],
  );

  const fetchProfile = useCallback(async () => {
    setProfileFetchDone(false);
    setProfileFetchError(null);
    try {
      if (!configured) return;
      const response = await fetch("/api/profile", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        profile?: UserProfileRow | null;
      };
      if (!response.ok) {
        setProfileFetchError(payload.error ?? "Could not load profile");
        return;
      }
      setProfile((payload.profile ?? null) as UserProfileRow | null);
      setProfileFetchError(null);
    } catch (e) {
      console.warn("[auth] profile fetch failed:", e);
      setProfileFetchError(e instanceof Error ? e.message : "Could not load profile");
      // Important: do not call setProfile(null) here — timeouts were incorrectly sending users to /profile/setup.
    } finally {
      setProfileFetchDone(true);
    }
  }, [configured]);

  useEffect(() => {
    if (!configured) {
      setReady(true);
      setProfileFetchDone(true);
      return;
    }

    let supabase: ReturnType<typeof createBrowserSupabaseClient>;
    try {
      supabase = createBrowserSupabaseClient();
    } catch (e) {
      console.error(e);
      setReady(true);
      setProfileFetchDone(true);
      return;
    }

    void (async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        setUser(session?.user ?? null);
        if (session?.user) {
          setReady(true);
          await fetchProfile();
        } else {
          setProfile(null);
          setProfileFetchError(null);
          setProfileFetchDone(true);
          setReady(true);
        }
      } catch (e) {
        console.error(e);
        setProfileFetchDone(true);
        setReady(true);
      }
    })();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setUser(session?.user ?? null);
      try {
        if (session?.user) {
          await fetchProfile();
        } else {
          setProfile(null);
          setProfileFetchError(null);
          setProfileFetchDone(true);
        }
      } finally {
        setReady(true);
      }
    });

    return () => subscription.unsubscribe();
  }, [configured, fetchProfile]);

  const refreshProfile = useCallback(async () => {
    if (!configured || !user) return;
    await fetchProfile();
  }, [configured, user, fetchProfile]);

  const signOut = useCallback(() => {
    if (typeof window === "undefined") return;
    if (signOutLock.current) return;
    signOutLock.current = true;
    setSigningOut(true);

    void (async () => {
      try {
        let serverOk = false;
        try {
          const res = await fetch(`${window.location.origin}/auth/sign-out`, {
            method: "POST",
            credentials: "include",
            cache: "no-store",
          });
          serverOk = res.ok;
        } catch {
          /* ignore */
        }

        if (!serverOk && configured) {
          try {
            await Promise.race([
              createBrowserSupabaseClient().auth.signOut({ scope: "global" }),
              new Promise<void>((resolve) => setTimeout(resolve, 10_000)),
            ]);
          } catch {
            /* ignore */
          }
        }

        try {
          for (const k of [...Object.keys(localStorage)]) {
            if (k.startsWith("sb-") || k.includes("supabase.auth")) {
              localStorage.removeItem(k);
            }
          }
          for (const k of [...Object.keys(sessionStorage)]) {
            if (k.startsWith("sb-") || k.includes("supabase.auth")) {
              sessionStorage.removeItem(k);
            }
          }
        } catch {
          /* ignore */
        }

        hardNavigate("/");
      } finally {
        signOutLock.current = false;
        setSigningOut(false);
      }
    })();
  }, [configured]);

  useEffect(() => {
    if (!ready || !configured || !user || !profileFetchDone) return;
    // Do not infer onboarding from a missing profile while load failed — that caused bogus redirects to /profile/setup.
    if (profileFetchError) return;
    const incomplete = !profile || !profile.onboarding_completed;
    if (!incomplete) return;
    const allowed =
      pathname.startsWith("/login") ||
      pathname.startsWith("/signup") ||
      pathname.startsWith("/auth/") ||
      pathname === "/profile/setup";
    if (allowed) return;
    router.replace("/profile/setup");
  }, [ready, configured, user, profile, profileFetchDone, profileFetchError, pathname, router]);

  const value = useMemo(
    () => ({
      configured,
      ready,
      user,
      profile,
      profileFetchError,
      signingOut,
      refreshProfile,
      mergeLocalProfile,
      signOut,
    }),
    [
      configured,
      ready,
      user,
      profile,
      profileFetchError,
      signingOut,
      refreshProfile,
      mergeLocalProfile,
      signOut,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
