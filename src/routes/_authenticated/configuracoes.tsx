import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, LogOut, Monitor, Moon, Sun } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/app/page-header";
import { FuncoesChips } from "@/components/app/funcoes-picker";
import { useCurrentUser, useDataAction } from "@/hooks/use-data";
import { teamRepository } from "@/lib/data";
import { supabase } from "@/integrations/supabase/client";
import { THEME_STORAGE_KEY } from "@/lib/theme";
import { TAMANHOS_FONTE } from "@/lib/font-scale";
import { useTamanhoFonte } from "@/hooks/use-tamanho-fonte";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  head: () => ({
    meta: [{ title: "Configurações — Patty One" }, { name: "robots", content: "noindex" }],
  }),
  component: ConfiguracoesPage,
});

type Tema = "light" | "dark" | "system";

const TEMAS: { value: Tema; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Claro", icon: Sun },
  { value: "dark", label: "Escuro", icon: Moon },
  { value: "system", label: "Automático", icon: Monitor },
];

/** "Automático" = no saved choice: THEME_INIT_SCRIPT then follows the system on every load. */
function aplicarTema(tema: Tema) {
  const escuro =
    tema === "dark" ||
    (tema === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", escuro);
  try {
    if (tema === "system") localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, tema);
  } catch {
    /* ignore */
  }
}

function temaSalvo(): Tema {
  try {
    const t = localStorage.getItem(THEME_STORAGE_KEY);
    return t === "dark" || t === "light" ? t : "system";
  } catch {
    return "system";
  }
}

const abaClass =
  "w-full justify-start rounded-xl px-4 py-2.5 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none";

function ConfiguracoesPage() {
  const { data: me } = useCurrentUser();
  const run = useDataAction();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [tema, setTema] = useState<Tema>("system");
  const [fonte, escolherFonte] = useTamanhoFonte();
  const [nome, setNome] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => setTema(temaSalvo()), []);
  useEffect(() => setNome(me?.name ?? ""), [me?.name]);

  async function salvarNome() {
    if (!me) return;
    if (nome.trim().length < 2) {
      toast.error("Informe um nome válido.");
      return;
    }
    setSalvando(true);
    await run(() => teamRepository.updateMyName(me.id, nome), "Perfil atualizado");
    setSalvando(false);
  }

  async function sair() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <>
      <PageHeader title="Configurações" description="Sua conta e suas preferências." />
      <Tabs
        defaultValue="aparencia"
        orientation="vertical"
        className="flex flex-col gap-6 md:flex-row"
      >
        <TabsList className="flex h-auto w-full flex-col justify-start gap-1 self-start rounded-2xl border bg-card p-2 shadow-sm md:w-56">
          <TabsTrigger value="aparencia" className={abaClass}>
            Aparência
          </TabsTrigger>
          <TabsTrigger value="perfil" className={abaClass}>
            Perfil
          </TabsTrigger>
          <TabsTrigger value="conta" className={abaClass}>
            Conta
          </TabsTrigger>
        </TabsList>
        <div className="flex-1">
          <TabsContent value="aparencia" className="mt-0">
            <Card className="rounded-2xl p-6 shadow-sm">
              <h2 className="font-semibold">Aparência</h2>
              <p className="text-sm text-muted-foreground">
                Escolha como o Patty One aparece para você.
              </p>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                {TEMAS.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    aria-pressed={tema === t.value}
                    onClick={() => {
                      aplicarTema(t.value);
                      setTema(t.value);
                    }}
                    className={cn(
                      "flex flex-col items-center gap-2 rounded-2xl border-2 p-5 transition-colors",
                      tema === t.value
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border text-muted-foreground hover:border-primary/40",
                    )}
                  >
                    <t.icon className="h-6 w-6" />
                    <span className="text-sm font-medium">{t.label}</span>
                  </button>
                ))}
              </div>

              <h3 className="mt-8 font-semibold">Tamanho da letra</h3>
              <p className="text-sm text-muted-foreground">
                Aumenta letra e espaços juntos, só neste computador. Também fica no botão “A” do
                topo.
              </p>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                {TAMANHOS_FONTE.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    aria-pressed={fonte === t.value}
                    onClick={() => escolherFonte(t.value)}
                    className={cn(
                      "flex flex-col items-center gap-2 rounded-2xl border-2 p-5 transition-colors",
                      fonte === t.value
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border text-muted-foreground hover:border-primary/40",
                    )}
                  >
                    <span className={cn("font-semibold", t.amostra)}>Aa</span>
                    <span className="text-sm font-medium">{t.label}</span>
                  </button>
                ))}
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="perfil" className="mt-0">
            <Card className="space-y-4 rounded-2xl p-6 shadow-sm">
              <h2 className="font-semibold">Perfil</h2>
              <div className="space-y-2">
                <Label htmlFor="cfg-nome">Nome</Label>
                <Input id="cfg-nome" value={nome} onChange={(e) => setNome(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cfg-email">E-mail</Label>
                <Input id="cfg-email" value={me?.email ?? ""} disabled />
              </div>
              {me && me.funcoes.length > 0 && (
                <div className="space-y-2">
                  <span className="text-sm font-medium">Funções</span>
                  <FuncoesChips funcoes={me.funcoes} />
                  <p className="text-xs text-muted-foreground">
                    As funções são definidas pela Gestão, na área Equipe.
                  </p>
                </div>
              )}
              <Button onClick={() => void salvarNome()} disabled={salvando || !me}>
                {salvando && <Loader2 className="animate-spin" />}
                Salvar alterações
              </Button>
            </Card>
          </TabsContent>

          <TabsContent value="conta" className="mt-0">
            <Card className="rounded-2xl p-6 shadow-sm">
              <h2 className="font-semibold">Conta</h2>
              <p className="mb-4 text-sm text-muted-foreground">
                Encerrar a sessão neste aparelho.
              </p>
              <Button variant="destructive" onClick={() => void sair()}>
                <LogOut />
                Sair
              </Button>
            </Card>
          </TabsContent>
        </div>
      </Tabs>
    </>
  );
}
