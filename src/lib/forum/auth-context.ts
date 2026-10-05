import { createContext, useContext } from "react";
import type { ForumBackend, Session } from "./types.ts";

export interface AuthState {
  /** loading: still starting; off: the forum isn't configured; ready: it is. */
  status: "loading" | "off" | "ready";
  backend: ForumBackend | null;
  session: Session | null;
  /** True after the person followed a password-reset link and must choose a new password. */
  recovering: boolean;
  finishRecovery: () => void;
}

export const AuthContext = createContext<AuthState>({ status: "loading", backend: null, session: null, recovering: false, finishRecovery: () => {} });

export const useAuth = () => useContext(AuthContext);
