import { createFileRoute } from "@tanstack/react-router";
import { handleAssistentePcp } from "@/lib/ai/assistente-pcp.server";

export const Route = createFileRoute("/api/assistente-pcp")({
  server: { handlers: { POST: ({ request }) => handleAssistentePcp(request) } },
});
