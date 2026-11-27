import { createFileRoute } from "@tanstack/react-router";
import { handleOrquestrador } from "@/lib/ai/orquestrador.server";

export const Route = createFileRoute("/api/orquestrador")({
  server: { handlers: { POST: ({ request }) => handleOrquestrador(request) } },
});
