import { createFileRoute } from "@tanstack/react-router";
import { handleNextSteps } from "@/lib/ai/next-steps.server";

export const Route = createFileRoute("/api/next-steps")({
  server: { handlers: { POST: ({ request }) => handleNextSteps(request) } },
});
