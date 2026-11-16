import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { currentUserQuery } from "@/hooks/use-data";

/** Areas only people with management permission (gestores) can open. */
export const Route = createFileRoute("/_authenticated/_gestor")({
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.fetchQuery(currentUserQuery());
    if (!me?.isGestor) throw redirect({ to: "/projetos" });
  },
  component: () => <Outlet />,
});
