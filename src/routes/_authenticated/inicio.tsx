import { createFileRoute, redirect } from "@tanstack/react-router";
import { currentUserQuery } from "@/hooks/use-data";
import { abreNoDashboard } from "@/lib/data";

/** Start page: Gestão and Direção open on the Dashboard, everyone else on Projetos. */
export const Route = createFileRoute("/_authenticated/inicio")({
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.fetchQuery(currentUserQuery());
    throw redirect({
      to: me && abreNoDashboard(me.funcoes, me.isGestor) ? "/dashboard" : "/projetos",
      replace: true,
    });
  },
});
