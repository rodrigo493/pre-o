import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";

type Modo = "entrar" | "criar";

export default function Login() {
  const [modo, setModo] = useState<Modo>("entrar");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    setLoading(false);
    if (error) {
      toast.error("Login falhou: " + error.message);
      return;
    }
    nav("/produtos", { replace: true });
  }

  async function criarConta(e: React.FormEvent) {
    e.preventDefault();
    if (senha.length < 6) {
      toast.error("A senha precisa ter pelo menos 6 caracteres.");
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({ email, password: senha });
    if (error) {
      setLoading(false);
      toast.error("Cadastro falhou: " + error.message);
      return;
    }
    // Confirmação de e-mail desligada → já vem sessão. Se não vier, tenta logar.
    if (data.session) {
      setLoading(false);
      toast.success("Conta criada!");
      nav("/produtos", { replace: true });
      return;
    }
    const { error: loginErr } = await supabase.auth.signInWithPassword({ email, password: senha });
    setLoading(false);
    if (loginErr) {
      toast.success("Conta criada. Faça login para entrar.");
      setModo("entrar");
      return;
    }
    nav("/produtos", { replace: true });
  }

  const criando = modo === "criar";

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

        <form onSubmit={criando ? criarConta : entrar} className="space-y-3">
          <div className="space-y-1">
            <Label>E-mail</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-1">
            <Label>Senha</Label>
            <Input
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              required
              minLength={6}
              placeholder={criando ? "mínimo 6 caracteres" : ""}
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading
              ? criando
                ? "Criando…"
                : "Entrando…"
              : criando
                ? "Criar conta"
                : "Entrar"}
          </Button>
        </form>

        <div className="mt-5 text-center text-sm text-muted-foreground">
          {criando ? (
            <>
              Já tem conta?{" "}
              <button
                type="button"
                onClick={() => setModo("entrar")}
                className="font-medium text-primary hover:underline"
              >
                Entrar
              </button>
            </>
          ) : (
            <>
              Não tem conta?{" "}
              <button
                type="button"
                onClick={() => setModo("criar")}
                className="font-medium text-primary hover:underline"
              >
                Criar conta
              </button>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}
