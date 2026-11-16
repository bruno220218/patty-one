import { z } from "zod";

/** Payload the browser sends to request next-step suggestions for a blocked project. */
export const nextStepsRequestSchema = z.object({
  project: z.object({
    name: z.string().trim().min(1).max(200),
    description: z.string().max(2000),
    dueDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable(),
    createdAt: z.string().max(40),
    tasks: z
      .array(
        z.object({
          title: z.string().trim().min(1).max(300),
          done: z.boolean(),
          completedAt: z.string().max(40).nullable(),
        }),
      )
      .max(200),
  }),
  blocker: z.string().trim().min(3).max(2000),
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type NextStepsRequest = z.infer<typeof nextStepsRequestSchema>;
