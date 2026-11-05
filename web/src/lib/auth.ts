import { useEffect, useState } from "react";

export type Principal = {
  identityProvider: string;
  userId: string;
  userDetails: string;
  userRoles: string[];
};

type AuthState = { status: "loading" } | { status: "anonymous" } | { status: "signed-in"; user: Principal; isAdmin: boolean };

// Static Web Apps exposes the current user at /.auth/me. In plain Vite dev there is no such
// endpoint; the Vite proxy injects an admin principal for /api/manage/* instead, so we treat
// a missing endpoint in DEV as "signed in as dev admin".
export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({ status: "loading" });
  useEffect(() => {
    fetch("/.auth/me")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: { clientPrincipal: Principal | null }) => {
        const user = data.clientPrincipal;
        if (!user) setState({ status: "anonymous" });
        else setState({ status: "signed-in", user, isAdmin: user.userRoles.includes("admin") });
      })
      .catch(() => {
        if (import.meta.env.DEV) {
          const user = { identityProvider: "dev", userId: "dev", userDetails: "Haval-Jalal (dev)", userRoles: ["admin"] };
          setState({ status: "signed-in", user, isAdmin: true });
        } else {
          setState({ status: "anonymous" });
        }
      });
  }, []);
  return state;
}

export const loginUrl = "/.auth/login/github?post_login_redirect_uri=/admin";
export const logoutUrl = "/.auth/logout?post_logout_redirect_uri=/";
