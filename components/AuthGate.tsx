"use client";

import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { doc, onSnapshot, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";
import { auth, db } from "@/lib/firebase";
import type { AppUser } from "@/lib/types";
import { effectiveRole } from "@/lib/access-control";

const AuthContext = createContext<{ user: User | null; profile: AppUser | null; logout: () => Promise<void> }>({ user: null, profile: null, logout: async () => {} });

export function useSession() { return useContext(AuthContext); }

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let stopProfile: (() => void) | undefined;

    const stopAuth = onAuthStateChanged(auth, async (current) => {
      stopProfile?.();

      if (!current) {
        setUser(null); setProfile(null); setLoading(false); router.replace("/login"); return;
      }

      setUser(current);
      const ref = doc(db, "users", current.uid);

      stopProfile = onSnapshot(ref, async (snap) => {
        if (!snap.exists()) {
          stopProfile?.();
          await signOut(auth);
          setLoading(false);
          router.replace("/login");
          return;
        }

        const data = snap.data() as AppUser;
        if (data.active === false) {
          stopProfile?.();
          await signOut(auth);
          setLoading(false);
          router.replace("/login?blocked=1");
          return;
        }

        setProfile({ ...data, uid: current.uid, role: effectiveRole(current.uid, data.role) });
        setLoading(false);
      });

      updateDoc(ref, { lastAccessAt: serverTimestamp() }).catch(() => undefined);
      setDoc(doc(db, "auditLogs", `${current.uid}_${Date.now()}`), {
        userId: current.uid,
        userName: current.displayName || current.email || "Usuário",
        userEmail: current.email || "",
        action: "LOGIN_SUCCESS",
        createdAt: serverTimestamp()
      }).catch(() => undefined);
    });

    return () => {
      stopProfile?.();
      stopAuth();
    };
  }, [router]);

  const logout = async () => { await signOut(auth); router.replace("/login"); };
  if (loading) return <div className="loading"><div className="spinner" /></div>;
  if (!user || !profile) return null;
  return <AuthContext.Provider value={{ user, profile, logout }}>{children}</AuthContext.Provider>;
}
