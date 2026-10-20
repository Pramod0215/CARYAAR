"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { apiRequest } from "@/lib/api";

export type User = { id: string; name: string; email: string; created_at: string };

type AuthContextValue = {
  user: User | null;
  isLoading: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

type AuthResponse = { user: User };

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiRequest<User>("/api/auth/me")
      .then(setUser)
      .catch((cause: unknown) => {
        if (!(cause instanceof Error) || !("status" in cause && cause.status === 401)) {
          setError(cause instanceof Error ? cause.message : "Could not check your account.");
        }
      })
      .finally(() => setIsLoading(false));
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const result = await apiRequest<AuthResponse>("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    setError(null);
    setUser(result.user);
  }, []);

  const signUp = useCallback(async (name: string, email: string, password: string) => {
    const result = await apiRequest<AuthResponse>("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });
    setError(null);
    setUser(result.user);
  }, []);

  const signOut = useCallback(async () => {
    await apiRequest<{ message: string }>("/api/auth/logout", { method: "POST" });
    setError(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, isLoading, error, signIn, signUp, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider.");
  }

  return context;
}
