import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";

export default function Login() {
  const [email, setEmail] = useState(""); const [senha, setSenha] = useState("");
  const [loading, setLoading] = useState(false); const nav = useNavigate();
  async function entrar(e: React.FormEvent) {
    e.preventDefault(); setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    setLoading(false);
    if (error) { toast.error("Login falhou: " + error.message); return; }
    nav("/produtos", { replace: true });
  }
  return (
    <div className="min-h-screen grid place-items-center bg-background px-4">
      <Card className="w-full max-w-sm rounded-2xl border-border bg-card p-7 shadow-sm">
        <div className="mb-6 flex flex-col items-center gap-3">
          <span className="inline-flex rounded-xl bg-[#0A0A0A] p-3">
            <img src="/logo-live.png" alt="Live" className="h-7 w-auto" />
          </span>
          <h1 className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
            Tabela de Preços
          </h1>
        </div>
        <form onSubmit={entrar} className="space-y-3">
          <div className="space-y-1">
            <Label>E-mail</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-1">
            <Label>Senha</Label>
            <Input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Entrando…" : "Entrar"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
