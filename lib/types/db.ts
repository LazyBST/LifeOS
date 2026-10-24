// Hand-written row types mirroring supabase/migrations/*.sql (spec sections 4, 5, 8, 9, 10).
// Keep in sync with the SQL by hand; this project has no codegen step.

export type UUID = string;
/** `date` column, 'YYYY-MM-DD' in IST. */
export type DateStr = string;
/** `timestamptz` column, ISO 8601 with offset. */
export type Instant = string;

export const AREA_NAMES = ['Business', 'Health & Fitness', 'Relationships', 'Finances'] as const;
export type AreaName = (typeof AREA_NAMES)[number];

export type EntityStatus = 'active' | 'paused' | 'done' | 'dropped';
export type TaskStatus = 'todo' | 'doing' | 'done';
export type Priority = 'P0' | 'P1' | 'P2' | 'P3';
export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'any';
export type TxKind = 'expense' | 'income' | 'settlement';
export type ChatChannel = 'web' | 'system';
export type ChatRole = 'user' | 'assistant' | 'tool';
export type EventSource = 'web' | 'chat' | 'gcal' | 'system';

/** UI labels for task status (spec section 4). */
export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  todo: 'Not started',
  doing: 'In progress',
  done: 'Done',
};
export const TASK_STATUSES: TaskStatus[] = ['todo', 'doing', 'done'];
export const PRIORITIES: Priority[] = ['P0', 'P1', 'P2', 'P3'];

export type AppConfig = {
  id: boolean;
  owner_user_id: UUID | null;
  timezone: string;
  morning_time: string; // 'HH:MM:SS'
  night_time: string;
  push_enabled: boolean;
  default_estimate_min: number;
};

export type Area = {
  id: UUID;
  name: string;
  color: string | null;
  sort_order: number;
};

export type Goal = {
  id: UUID;
  title: string;
  emoji: string | null;
  description: string | null;
  area_id: UUID | null;
  status: EntityStatus;
  priority: Priority;
  start_date: DateStr | null;
  target_date: DateStr | null;
  notes_md: string;
  created_at: Instant;
  updated_at: Instant;
  deleted_at: Instant | null;
};

export type Project = {
  id: UUID;
  goal_id: UUID;
  title: string;
  emoji: string | null;
  description: string | null;
  area_id: UUID | null;
  status: EntityStatus;
  priority: Priority;
  start_date: DateStr | null;
  target_date: DateStr | null;
  notes_md: string;
  created_at: Instant;
  updated_at: Instant;
  deleted_at: Instant | null;
};

export type Task = {
  id: UUID;
  title: string;
  goal_id: UUID | null;
  project_id: UUID | null;
  parent_task_id: UUID | null;
  area_id: UUID | null;
  status: TaskStatus;
  priority: Priority;
  due_date: DateStr | null;
  due_at: Instant | null;
  duration_min: number | null;
  estimate_min: number | null;
  notes_md: string;
  tags: string[];
  sort_order: number;
  completed_at: Instant | null;
  created_at: Instant;
  updated_at: Instant;
  deleted_at: Instant | null;
};

export type TaskEvent = {
  id: number;
  task_id: UUID;
  goal_id: UUID | null;
  project_id: UUID | null;
  area_id: UUID | null;
  event: 'created' | 'completed' | 'reopened' | 'deleted';
  estimate_min: number | null;
  at: Instant;
  source: EventSource;
};

export type Habit = {
  id: UUID;
  name: string;
  emoji: string | null;
  time_of_day: TimeOfDay;
  kind: 'boolean' | 'count';
  target_value: number;
  unit: string | null;
  days_of_week: number[] | null; // 1=Mon .. 7=Sun
  reminder_time: string | null;
  area_id: UUID | null;
  goal_id: UUID | null;
  archived_at: Instant | null;
  created_at: Instant;
};

export type HabitCheckin = {
  id: UUID;
  habit_id: UUID;
  checkin_date: DateStr;
  value: number;
  note: string | null;
};

export type JournalEntry = {
  id: UUID;
  entry_date: DateStr;
  body_md: string;
  mood: number | null;
  created_at: Instant;
  updated_at: Instant;
};

export type Reminder = {
  id: UUID;
  text: string;
  remind_at: Instant;
  task_id: UUID | null;
  habit_id: UUID | null;
  recurrence: 'daily' | 'weekdays' | 'weekly' | null;
  sent_at: Instant | null;
  cancelled_at: Instant | null;
};

export type DailyPlan = {
  plan_date: DateStr;
  task_ids: UUID[];
  plan_md: string | null;
  accepted_at: Instant | null;
};

export type ChatMessage = {
  id: number;
  channel: ChatChannel;
  role: ChatRole;
  content: ChatContent;
  page_context: PageContext | null;
  created_at: Instant;
};

/** Stored shape of `chat_messages.content`. */
export type ChatContent = {
  text: string;
  cards?: ToolResultCard[];
  /** present on role='tool' rows */
  tool?: string;
  /** a pending disambiguation question, answered by the next message */
  pending?: PendingChoice | null;
};

export type ToolResultCard = {
  kind: 'task' | 'goal' | 'project' | 'habit' | 'journal' | 'money' | 'report' | 'info' | 'error';
  title: string;
  subtitle?: string;
  href?: string;
  badges?: string[];
};

export type PendingChoice = {
  /** the tool call that is waiting on the user picking an option */
  tool: string;
  input: Record<string, unknown>;
  /** which argument the options fill in, e.g. 'ref' */
  field: string;
  options: { id: UUID; label: string; path?: string }[];
};

export type AgentAction = {
  id: number;
  tool: string;
  input: unknown;
  before: unknown;
  after: unknown;
  created_at: Instant;
  undone_at: Instant | null;
};

export type Account = {
  id: UUID;
  name: string;
  opening_balance: number;
  is_default: boolean;
  archived_at: Instant | null;
};

export type Category = { id: UUID; name: string };

export type Transaction = {
  id: UUID;
  occurred_on: DateStr;
  kind: TxKind;
  description: string | null;
  category_id: UUID | null;
  account_id: UUID | null;
  amount: number;
  my_share: number | null;
  counterparty: string | null;
  note: string | null;
  raw_text: string | null;
  created_at: Instant;
  deleted_at: Instant | null;
};

export type PushSubscriptionRow = {
  id: UUID;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent: string | null;
  last_error: string | null;
  created_at: Instant;
};

export type GcalCalendar = {
  google_calendar_id: string;
  role: 'lifeos_rw' | 'primary_ro';
  sync_token: string | null;
  channel_id: string | null;
  channel_resource_id: string | null;
  channel_token: string | null;
  channel_expires_at: Instant | null;
};

export type GcalLink = {
  task_id: UUID;
  google_calendar_id: string;
  google_event_id: string;
  etag: string | null;
  google_updated_at: Instant | null;
  local_updated_at: Instant | null;
  last_synced_at: Instant | null;
};

export type CalendarEventRow = {
  google_event_id: string;
  summary: string | null;
  starts_at: Instant | null;
  ends_at: Instant | null;
  all_day: boolean | null;
  updated_at: Instant | null;
};

export type GcalOutboxRow = {
  id: number;
  task_id: UUID | null;
  op: 'upsert' | 'delete';
  attempts: number;
  last_error: string | null;
  enqueued_at: Instant;
  done_at: Instant | null;
};

export type GoogleTokens = {
  id: boolean;
  refresh_token: string | null;
  access_token: string | null;
  access_token_expires_at: Instant | null;
  scope: string | null;
  connected_email: string | null;
  updated_at: Instant;
};

// ---- view rows -------------------------------------------------------------

export type OwedByLabel = { label: string; owed: number };
export type AccountBalance = { id: UUID; name: string; balance: number };
export type Wallet = { cash_on_hand: number; owed_to_me: number; i_owe: number; net: number };

export type GoalProgressRow = {
  goal_id: UUID;
  title: string;
  area_id: UUID | null;
  target_date: DateStr | null;
  done_min: number;
  total_min: number;
  remaining_min: number;
  unestimated: number;
};

export type ProjectProgressRow = {
  project_id: UUID;
  title: string;
  goal_id: UUID;
  area_id: UUID | null;
  target_date: DateStr | null;
  done_min: number;
  total_min: number;
  remaining_min: number;
  unestimated: number;
};

export type CompletedDailyRow = {
  day: DateStr;
  area_id: UUID | null;
  goal_id: UUID | null;
  tasks: number;
  effort_min: number;
};

// ---- agent page context ----------------------------------------------------

export type EntityType = 'goal' | 'project' | 'task' | 'area' | 'habit' | 'none';

export type PageContext = {
  route: string;
  entity_type: EntityType;
  entity_id?: UUID | null;
  area_id?: UUID | null;
  filters?: Record<string, unknown> | null;
};
