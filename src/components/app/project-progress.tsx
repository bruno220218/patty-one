import { Progress } from "@/components/ui/progress";
import { projectProgress, type ProjectTask } from "@/lib/data";

export function ProjectProgressBar({ tasks }: { tasks: ProjectTask[] }) {
  const { percent } = projectProgress(tasks);
  return <Progress value={percent} aria-label={`Progresso ${percent}%`} className="h-2" />;
}
