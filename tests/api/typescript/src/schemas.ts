import { z } from "zod";

export const TodoSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  dueDate: z.string().optional(),
  labels: z.array(z.string()).optional(),
  completed: z.boolean(),
  completedAt: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  attachmentId: z.string().optional(),
  location: z.object({
    uri: z.string(),
    method: z.string().optional(),
    headers: z.record(z.string()).optional(),
  }).optional(),
});

export type Todo = z.infer<typeof TodoSchema>;

// Operation argument schemas

export const CreateTodoArgsSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  dueDate: z.string().optional(),
  labels: z.array(z.string()).optional(),
});

export const GetTodoArgsSchema = z.object({
  id: z.string(),
});

export const ListTodosArgsSchema = z.object({
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(20),
  completed: z.boolean().optional(),
  label: z.string().optional(),
});

export const UpdateTodoArgsSchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  description: z.string().optional(),
  dueDate: z.string().optional(),
  labels: z.array(z.string()).optional(),
  completed: z.boolean().optional(),
});

export const DeleteTodoArgsSchema = z.object({
  id: z.string(),
});

export const CompleteTodoArgsSchema = z.object({
  id: z.string(),
});

// Result schemas

export const ListTodosResultSchema = z.object({
  items: z.array(TodoSchema),
  cursor: z.string().nullable(),
  total: z.number().int(),
});

export const DeleteTodoResultSchema = z.object({
  deleted: z.boolean(),
});

// Async operation schemas

export const ExportTodosArgsSchema = z.object({
  format: z.enum(["csv", "json"]).default("csv"),
});

export const ExportTodosResultSchema = z.object({
  format: z.string(),
  data: z.string(),
  count: z.number().int(),
});

export const GenerateReportArgsSchema = z.object({
  type: z.enum(["summary", "detailed"]).default("summary"),
});

export const GenerateReportResultSchema = z.object({
  type: z.string(),
  totalTodos: z.number().int(),
  completedTodos: z.number().int(),
  pendingTodos: z.number().int(),
  generatedAt: z.string(),
});

// Deprecated operation schemas

export const SearchTodosArgsSchema = z.object({
  query: z.string(),
  limit: z.number().int().min(1).max(100).default(20),
});

// Debug operation schemas

export const SimulateErrorArgsSchema = z.object({
  statusCode: z.number().int(),
  code: z.string().default("SIMULATED_ERROR"),
  message: z.string().default("Simulated error for testing"),
});

export const SimulateErrorResultSchema = z.object({
  simulated: z.boolean(),
});

// Media operation schemas

export const AttachTodoArgsSchema = z.object({
  todoId: z.string(),
  ref: z.string().optional(), // URI reference instead of inline upload
});

export const AttachTodoResultSchema = z.object({
  todoId: z.string(),
  attachmentId: z.string(),
  contentType: z.string(),
  filename: z.string(),
});

// Streaming schemas

export const WatchTodosArgsSchema = z.object({
  filter: z.enum(["all", "completed", "pending"]).default("all"),
});

export const WatchTodosFrameSchema = z.object({
  event: z.enum(["created", "updated", "deleted", "completed"]),
  todo: TodoSchema.optional(),
  todoId: z.string().optional(),
  timestamp: z.string(),
});
