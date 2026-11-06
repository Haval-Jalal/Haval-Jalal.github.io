import { useEffect, useState } from "react";

export type Principal = {
  provider: string;
  userId: string;
  userDetails: string;
};

export type AuthState =
  | { status: "loading" }
  | { status: "anonymous" }
  | { status: "signed-in"; user: Principal; isAdmin: boolean; banned: boolean };

type MeResponse = {
  authenticated: boolean;
  provider?: string;
  user?: string;
  userId?: string;
  isAdmin?: boolean;
  banned?: boolean;
};

// Asks the API who is signed in. Static Web Apps forwards the GitHub identity to the API on every
// request, so the API (not the browser) is the source of truth, and it logs every account that
// reaches the admin page. In plain Vite dev the proxy injects a dev admin identity.
export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({ status: "loading" });
  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<MeResponse>) : Promise.reject(new Error(String(r.status)))))
      .then((me) => {
        if (!me.authenticated) setState({ status: "anonymous" });
        else
          setState({
            status: "signed-in",
            user: { provider: me.provider ?? "github", userId: me.userId ?? "", userDetails: me.user ?? "" },
            isAdmin: !!me.isAdmin,
            banned: !!me.banned,
          });
      })
      .catch(() => {
        if (import.meta.env.DEV) {
          setState({ status: "signed-in", user: { provider: "dev", userId: "dev", userDetails: "Haval-Jalal (dev)" }, isAdmin: true, banned: false });
        } else {
          setState({ status: "anonymous" });
        }
      });
  }, []);
  return state;
}

export const loginUrl = "/.auth/login/github?post_login_redirect_uri=/admin";
export const logoutUrl = "/.auth/logout?post_logout_redirect_uri=/";
