import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Eye, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ViewAsBanner() {
  const { isAdmin, viewAs, setViewAs } = useAuth();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin || !viewAs) {
      setEmail(null);
      return;
    }
    supabase
      .from("profiles")
      .select("email")
      .eq("id", viewAs)
      .maybeSingle()
      .then(({ data }) => setEmail(data?.email ?? viewAs));
  }, [isAdmin, viewAs]);

  if (!isAdmin || !viewAs) return null;

  return (
    <div className="bg-primary/10 border-b border-primary/30 px-4 py-2 flex items-center gap-2 text-xs">
      <Eye className="h-3.5 w-3.5 text-primary" />
      <span className="font-mono">
        Visualizando como parceiro: <strong className="font-mono">{email ?? viewAs}</strong>
      </span>
      <Button
        size="sm"
        variant="ghost"
        className="ml-auto h-6 text-xs text-primary hover:text-primary hover:bg-primary/10"
        onClick={() => setViewAs(null)}
      >
        <X className="h-3 w-3 mr-1" /> Sair desse modo
      </Button>
    </div>
  );
}