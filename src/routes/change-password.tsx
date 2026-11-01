import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import loginLogo from "@/assets/login-logo.png";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/change-password")({
  component: ChangePasswordPage,
});

function validate(pw: string): string | null {
  if (pw.length < 8) return "A senha deve ter ao menos 8 caracteres";
  if (!/[A-Z]/.test(pw)) return "Inclua ao menos uma letra maiúscula";
  if (!/[0-9]/.test(pw)) return "Inclua ao menos um número";
  return null;
}

function ChangePasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        navigate({ to: "/login" });
      } else {
        setChecking(false);
      }
    });
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = validate(password);
    if (err) return toast.error(err);
    if (password !== confirm) return toast.error("As senhas não coincidem");
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password,
        data: { must_change_password: false },
      });
      if (error) throw error;
      toast.success("Senha atualizada com sucesso");
      navigate({ to: "/hub" });
    } catch (err: any) {
      toast.error(err.message ?? "Erro ao atualizar senha");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-sidebar px-4 py-12">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-[600px] w-[800px] -translate-x-1/2 rounded-full opacity-30 blur-3xl"
        style={{ background: "var(--gradient-hero)" }}
      />
      <div className="relative w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-20 w-20 items-center justify-center">
            <img src={loginLogo} alt="Logo" className="h-full w-full object-contain" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-sidebar-foreground">
            Defina uma nova senha
          </h1>
          <p className="mt-1 text-sm text-sidebar-foreground/70">
            Por segurança, troque a senha temporária antes de continuar
          </p>
        </div>

        <div className="rounded-2xl border border-border/40 bg-card p-8 shadow-elegant">
          {checking ? (
            <p className="text-center text-sm text-muted-foreground">Validando sessão…</p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">Nova senha</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                />
                <p className="text-xs text-muted-foreground">
                  Mínimo 8 caracteres, com ao menos 1 maiúscula e 1 número.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm">Confirmar senha</Label>
                <Input
                  id="confirm"
                  type="password"
                  required
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar e continuar
              </Button>
            </form>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-sidebar-foreground/50">v1.5 · Powered by Exemplo</p>
      </div>
    </div>
  );
}
