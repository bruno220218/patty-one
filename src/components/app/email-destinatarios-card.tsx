import { useState, type FormEvent } from "react";
import { Info, Mail, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDataAction, useEmailDestinatarios } from "@/hooks/use-data";
import { emailDestinatariosRepository, emailValido } from "@/lib/data";

/** Gestão keeps the list of e-mails that receive every approved liberação. */
export function EmailDestinatariosCard() {
  const { data: lista, isPending } = useEmailDestinatarios();
  const run = useDataAction();
  const [email, setEmail] = useState("");
  const [nome, setNome] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const ativo = lista !== null && lista !== undefined;

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!emailValido(email)) {
      setErro("Digite um e-mail válido.");
      return;
    }
    setErro(null);
    const ok = await run(
      () => emailDestinatariosRepository.add(email, nome).then(() => true),
      "E-mail adicionado.",
    );
    if (ok) {
      setEmail("");
      setNome("");
    }
  };

  return (
    <section className="surface-card p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Mail className="h-4 w-4 text-muted-foreground" />
        Quem recebe as liberações aprovadas
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Quando o PCP, a direção ou a gestão aprova uma liberação, o PDF vai para todos estes
        e-mails.
      </p>

      {!isPending && !ativo ? (
        <p className="mt-4 flex items-start gap-2 text-sm text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />O envio por e-mail ainda não foi ativado no
          banco.
        </p>
      ) : (
        <>
          <form onSubmit={add} className="mt-4 flex flex-col gap-2 sm:flex-row" noValidate>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@pattynet.com.br"
              aria-label="E-mail"
              className="sm:flex-[2]"
            />
            <Input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Nome ou setor (opcional)"
              aria-label="Nome ou setor"
              className="sm:flex-[1.5]"
            />
            <Button type="submit" disabled={!email.trim()}>
              <Plus />
              Adicionar
            </Button>
          </form>
          {erro && <p className="mt-2 text-sm text-destructive">{erro}</p>}

          <ul className="mt-4 divide-y divide-border">
            {(lista ?? []).length === 0 && !isPending && (
              <li className="py-3 text-sm text-muted-foreground">
                Nenhum e-mail ainda. Enquanto a lista estiver vazia, nada é enviado.
              </li>
            )}
            {(lista ?? []).map((d) => (
              <li key={d.id} className="flex items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{d.email}</p>
                  {d.nome && <p className="truncate text-xs text-muted-foreground">{d.nome}</p>}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remover ${d.email}`}
                  onClick={() =>
                    run(() => emailDestinatariosRepository.remove(d.id), "E-mail removido.")
                  }
                >
                  <X />
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
