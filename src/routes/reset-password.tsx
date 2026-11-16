import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Nova senha — Patty One" },
      { name: "description", content: "Crie uma nova senha para sua conta Patty One." },
      { property: "og:title", content: "Nova senha — Patty One" },
      { property: "og:description", content: "Crie uma nova senha para sua conta Patty One." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const isRecovery = window.location.hash.includes("type=recovery");
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReady(true);
    });
    supabase.auth.getSession().then(({ data: s }) => {
      if (s.session && isRecovery) setReady(true);
    });
    if (isRecovery) setReady(true);
    return () => data.subscription.unsubscribe();
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      setError("A senha precisa ter pelo menos 6 caracteres.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      setError("Não foi possível salvar a nova senha. Peça um novo link e tente de novo.");
      return;
    }
    toast.success("Senha alterada.");
    navigate({ to: "/projetos", replace: true });
  };

  return (
    <div className="flex min-h-[80vh] items-center justify-center">
      <div className="surface-card w-full max-w-sm p-5">
        <h1 className="text-lg font-semibold">Criar nova senha</h1>
        {ready ? (
          <form onSubmit={submit} className="mt-4 space-y-4" noValidate>
            <div className="space-y-2">
              <Label htmlFor="new-password">Nova senha</Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error && <p className="text-sm font-medium text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={busy || !password}>
              Salvar senha
            </Button>
          </form>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            Abra esta página pelo link enviado ao seu e-mail.{" "}
            <Link to="/auth" className="font-medium text-primary hover:underline">
              Voltar para entrar
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
