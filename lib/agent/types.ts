// The one tool-registry contract shared by the web chat and the scheduled jobs
// (spec section 3). Each tool is {name, description, zod schema, handler}.
import type { z } from 'zod';
import type { PageContext, ToolResultCard, PendingChoice } from '@/lib/types/db';

export type ToolContext = {
  /** page the user is on; drives "add a task" with no parent (spec section 7) */
  page: PageContext;
  /** 'web' for the chat panel, 'system' for cron jobs */
  channel: 'web' | 'system';
  /** ids touched earlier in this conversation, most recent first */
  recent: { type: string; id: string; title: string }[];
  /** now, so tests can pin it */
  now: Date;
};

export type ToolOutcome = {
  /** one-line confirmation the model echoes back */
  message: string;
  cards?: ToolResultCard[];
  /** when set, the loop stops and the user is asked to pick */
  pending?: PendingChoice;
  /** ids touched, appended to ctx.recent */
  touched?: { type: string; id: string; title: string }[];
  /** free-form payload for the model to read */
  data?: unknown;
};

export type ToolDef<S extends z.ZodTypeAny = z.ZodTypeAny> = {
  name: string;
  description: string;
  schema: S;
  /** true for tools that need an explicit confirmation turn (spec section 7) */
  confirm?: boolean;
  /** part of the build this tool belongs to, used only for documentation */
  part?: 1 | 2 | 3;
  handler: (input: z.infer<S>, ctx: ToolContext) => Promise<ToolOutcome>;
};

export type ToolRegistry = Record<string, ToolDef>;

/** Thrown by tools for errors the user should simply be told about. */
export class ToolError extends Error {}
