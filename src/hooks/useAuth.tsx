import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type ParceiroStatus = "pendente" | "ativo" | "suspenso";
export type Parceiro = {
  user_id: string;
  nome: string | null;
  whatsapp: string | null;
  status: ParceiroStatus;
  limite_clientes: number;
  limite_workspaces: number;
  limite_creditos: number;
  creditos_consumidos: number;
};

type AuthContextType = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  parceiro: Parceiro | null;
  refreshParceiro: () => Promise<void>;
  viewAs: string | null;
  setViewAs: (id: string | null) => void;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: true,
  isAdmin: false,
  parceiro: null,
  refreshParceiro: async () => {},
  viewAs: null,
  setViewAs: () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [parceiro, setParceiro] = useState<Parceiro | null>(null);
  const [viewAs, setViewAsState] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("viewAs");
  });

  const setViewAs = (id: string | null) => {
    setViewAsState(id);
    if (id) localStorage.setItem("viewAs", id);
    else localStorage.removeItem("viewAs");
  };

  const fetchParceiro = async (uid: string) => {
    const { data } = await supabase
      .from("parceiros")
      .select("*")
      .eq("user_id", uid)
      .maybeSingle();
    setParceiro((data as Parceiro) ?? null);
  };

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setLoading(false);
      if (s?.user) {
        setTimeout(() => {
          supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", s.user.id)
            .eq("role", "admin")
            .maybeSingle()
            .then(({ data }) => setIsAdmin(!!data));
          fetchParceiro(s.user.id);
        }, 0);
      } else {
        setIsAdmin(false);
        setParceiro(null);
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
      if (data.session?.user) {
        supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", data.session.user.id)
          .eq("role", "admin")
          .maybeSingle()
          .then(({ data: r }) => setIsAdmin(!!r));
        fetchParceiro(data.session.user.id);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        loading,
        isAdmin,
        parceiro,
        refreshParceiro: async () => {
          if (session?.user) await fetchParceiro(session.user.id);
        },
        viewAs: isAdmin ? viewAs : null,
        setViewAs,
        signOut: async () => {
          setViewAs(null);
          await supabase.auth.signOut();
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);