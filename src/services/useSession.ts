"use client";

import { useEffect, useState } from "react";
import { AuthService, UserSession } from "./authService";

/**
 * The signed-in user, shared by the header, sidebar and till bar: one cached
 * request instead of four calls to `/auth/me`. Cleared on sign-out, so the
 * next person does not see the last one's name.
 */

let inFlight: Promise<UserSession | null> | null = null;

export function loadSession(): Promise<UserSession | null> {
  if (!inFlight) {
    inFlight = AuthService.getCurrentUser().catch(() => {
      // A failure must not be cached: a token that has just expired will work
      // again the moment it is refreshed.
      inFlight = null;
      return null;
    });
  }
  return inFlight;
}

export function clearSessionCache() {
  inFlight = null;
}

export function useSession(): { user: UserSession | null; loading: boolean } {
  const [user, setUser] = useState<UserSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    loadSession()
      .then((u) => alive && setUser(u))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  return { user, loading };
}
