import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Patty One — Checklists e projetos" },
      {
        name: "description",
        content: "Organize checklists e acompanhe projetos da equipe Patty com a Patty One.",
      },
      { property: "og:title", content: "Patty One — Checklists e projetos" },
      {
        property: "og:description",
        content: "Organize checklists e acompanhe projetos da equipe Patty com a Patty One.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/inicio" });
  },
});
