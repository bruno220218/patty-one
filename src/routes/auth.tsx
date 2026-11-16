import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { safeRedirectPath } from "@/lib/safe-redirect";

/** Served from public/ so it works on any host (not only Lovable). */
const LOGO_URL = "/patty-logo.png";

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => {
    const redirect = safeRedirectPath(search["redirect"]);
    return redirect ? { redirect } : {};
  },
  head: () => ({
    meta: [
      { title: "Entrar — Patty One" },
      { name: "description", content: "Entre na Patty One para acompanhar checklists e projetos." },
      { property: "og:title", content: "Entrar — Patty One" },
      {
        property: "og:description",
        content: "Entre na Patty One para acompanhar checklists e projetos.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

const PENDING_REDIRECT_KEY = "pattyone:after-login";

function AuthPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const goNext = () => {
    let target = search.redirect;
    try {
      target = target ?? safeRedirectPath(sessionStorage.getItem(PENDING_REDIRECT_KEY));
      sessionStorage.removeItem(PENDING_REDIRECT_KEY);
    } catch {
      /* ignore */
    }
    navigate({ to: target ?? "/projetos", replace: true });
  };

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) goNext();
    });
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) goNext();
    });
    return () => data.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rememberRedirect = () => {
    try {
      if (search.redirect) sessionStorage.setItem(PENDING_REDIRECT_KEY, search.redirect);
    } catch {
      /* ignore */
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          setError(
            error.message.toLowerCase().includes("confirm")
              ? "Confirme seu e-mail antes de entrar. Veja a mensagem que enviamos."
              : "E-mail ou senha incorretos.",
          );
          return;
        }
        goNext();
      } else if (mode === "signup") {
        if (!name.trim()) {
          setError("Informe seu nome.");
          return;
        }
        if (password.length < 6) {
          setError("A senha precisa ter pelo menos 6 caracteres.");
          return;
        }
        rememberRedirect();
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin + "/auth",
            data: { display_name: name.trim() },
          },
        });
        if (error) {
          setError(
            error.message.toLowerCase().includes("registered")
              ? "Este e-mail já tem conta. Entre com sua senha."
              : "Não foi possível criar a conta. Confira os dados e tente de novo.",
          );
          return;
        }
        if (data.session) {
          goNext();
        } else {
          setNotice(
            'Conta criada! Confira seu e-mail e clique no link para confirmar. Se você já entrava com Google, use "Esqueci minha senha" na aba Entrar para criar uma senha.',
          );
        }
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin + "/reset-password",
        });
        if (error) {
          setError("Não foi possível enviar o e-mail agora. Tente novamente.");
          return;
        }
        setNotice("Se houver uma conta com este e-mail, enviamos um link para criar nova senha.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-[80vh] items-center justify-center">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <img src={LOGO_URL} alt="Patty" className="h-14 w-14 rounded-full" />
          <h1 className="mt-3 text-xl font-bold tracking-tight">Patty One</h1>
          <p className="mt-1 text-sm text-muted-foreground">Checklists e projetos da equipe.</p>
        </div>

        <div className="surface-card p-5">
          {mode === "forgot" ? (
            <form onSubmit={submit} className="space-y-4" noValidate>
              <div>
                <h2 className="text-base font-semibold">Esqueci minha senha</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Enviaremos um link para você criar uma nova senha.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="forgot-email">E-mail</Label>
                <Input
                  id="forgot-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              {error && <p className="text-sm font-medium text-destructive">{error}</p>}
              {notice && <p className="text-sm text-accent-foreground">{notice}</p>}
              <Button type="submit" className="w-full" disabled={busy || !email}>
                Enviar link
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => setMode("signin")}
              >
                Voltar para entrar
              </Button>
            </form>
          ) : (
            <Tabs
              value={mode}
              onValueChange={(v) => {
                setMode(v as "signin" | "signup");
                setError(null);
                setNotice(null);
              }}
            >
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="signin">Entrar</TabsTrigger>
                <TabsTrigger value="signup">Criar conta</TabsTrigger>
              </TabsList>

              <div className="mt-4" />

              <form onSubmit={submit} className="space-y-4" noValidate>
                <TabsContent value="signup" className="m-0 space-y-2">
                  <Label htmlFor="auth-name">Seu nome</Label>
                  <Input
                    id="auth-name"
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </TabsContent>
                <div className="space-y-2">
                  <Label htmlFor="auth-email">E-mail</Label>
                  <Input
                    id="auth-email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="auth-password">Senha</Label>
                    {mode === "signin" && (
                      <button
                        type="button"
                        className="text-xs font-medium text-primary hover:underline"
                        onClick={() => {
                          setMode("forgot");
                          setError(null);
                          setNotice(null);
                        }}
                      >
                        Esqueci minha senha
                      </button>
                    )}
                  </div>
                  <Input
                    id="auth-password"
                    type="password"
                    autoComplete={mode === "signin" ? "current-password" : "new-password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                {error && (
                  <p className="text-sm font-medium text-destructive" role="alert">
                    {error}
                  </p>
                )}
                {notice && <p className="text-sm text-accent-foreground">{notice}</p>}
                <Button type="submit" className="w-full" disabled={busy || !email || !password}>
                  {mode === "signin" ? "Entrar" : "Criar conta"}
                </Button>
              </form>
            </Tabs>
          )}
        </div>
      </div>
    </div>
  );
}
