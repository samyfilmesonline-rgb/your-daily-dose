import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

const Index = () => {
  const navigate = useNavigate();
  const { session, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    navigate(session ? "/dashboard" : "/auth", { replace: true });
  }, [session, loading, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center text-muted-foreground">
      Carregando…
    </div>
  );
};

export default Index;
