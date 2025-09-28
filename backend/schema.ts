import { z } from 'zod';

// USERS SCHEMAS

// Main entity schema for users
export const userSchema = z.object({
  user_id: z.string(),
  email: z.string(),
  password_hash: z.string(),
  name: z.string().nullable(),
  predefined_categories: z.array(z.string()).default(['Work', 'Personal', 'School', 'Other']),
  created_at: z.coerce.date()
});

// Input schema for creating users
export const createUserInputSchema = z.object({
  email: z.string().email('Invalid email address').min(1).max(255),
  password_hash: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(1).max(100).nullable(),
  predefined_categories: z.array(z.string()).min(1).default(['Work', 'Personal', 'School', 'Other'])
});

// Input schema for updating users
export const updateUserInputSchema = z.object({
  user_id: z.string(),
  email: z.string().email('Invalid email address').min(1).max(255).optional(),
  password_hash: z.string().min(60, 'Password hash must be at least 60 characters (e.g., bcrypt)').optional(),
  name: z.string().min(1).max(100).nullable().optional(),
  predefined_categories: z.array(z.string()).min(1).optional().default(['Work', 'Personal', 'School', 'Other'])
});

// Query/search schema for users with defaults
export const searchUserInputSchema = z.object({
  query: z.string().optional(),
  limit: z.number().int().positive().max(100).default(10),
  offset: z.number().int().nonnegative().default(0),
  sort_by: z.enum(['user_id', 'email', 'name', 'created_at']).default('created_at'),
  sort_order: z.enum(['asc', 'desc']).default('desc')
});

// Inferred types for users
export type User = z.infer<typeof userSchema>;
export type CreateUserInput = z.infer<typeof createUserInputSchema>;
export type UpdateUserInput = z.infer<typeof updateUserInputSchema>;
export type SearchUserInput = z.infer<typeof searchUserInputSchema>;

// TASKS SCHEMAS

// Main entity schema for tasks
export const taskSchema = z.object({
  task_id: z.string(),
  user_id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  due_date: z.coerce.date().nullable(),
  priority: z.enum(['low', 'medium', 'high']).nullable(),
  category: z.string().nullable(),
  tags: z.string().nullable(),
  status: z.enum(['incomplete', 'completed', 'archived']),
  order_index: z.number().int().nonnegative(),
  share_expires_at: z.coerce.date().nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

// Input schema for creating tasks
export const createTaskInputSchema = z.object({
  user_id: z.string().min(1),
  title: z.string().min(1).max(255),
  description: z.string().max(1000).nullable(),
  due_date: z.coerce.date().nullable(),
  priority: z.enum(['low', 'medium', 'high']).nullable(),
  category: z.string().min(1).max(100).nullable(),
  tags: z.string().max(500).nullable(), // Comma-separated tags
  status: z.enum(['incomplete', 'completed', 'archived']).default('incomplete'),
  order_index: z.number().int().nonnegative().default(0),
  share_expires_at: z.coerce.date().nullable()
});

// Input schema for updating tasks
export const updateTaskInputSchema = z.object({
  task_id: z.string(),
  user_id: z.string().min(1).optional(), // Typically not updated, but allow if needed
  title: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).nullable().optional(),
  due_date: z.coerce.date().nullable().optional(),
  priority: z.enum(['low', 'medium', 'high']).nullable().optional(),
  category: z.string().min(1).max(100).nullable().optional(),
  tags: z.string().max(500).nullable().optional(),
  status: z.enum(['incomplete', 'completed', 'archived']).optional(),
  order_index: z.number().int().nonnegative().optional(),
  share_expires_at: z.coerce.date().nullable().optional()
});

// Query/search schema for tasks with defaults
export const searchTaskInputSchema = z.object({
  query: z.string().optional(), // Search in title, description, category
  user_id: z.string().optional(),
  status: z.enum(['incomplete', 'completed', 'archived']).optional(),
  category: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  limit: z.number().int().positive().max(100).default(10),
  offset: z.number().int().nonnegative().default(0),
  sort_by: z.enum(['title', 'due_date', 'priority', 'status', 'order_index', 'created_at', 'updated_at']).default('order_index'),
  sort_order: z.enum(['asc', 'desc']).default('asc')
});

// Inferred types for tasks
export type Task = z.infer<typeof taskSchema>;
export type CreateTaskInput = z.infer<typeof createTaskInputSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskInputSchema>;
export type SearchTaskInput = z.infer<typeof searchTaskInputSchema>;

// PASSWORD_RESETS SCHEMAS

// Main entity schema for password_resets
export const passwordResetSchema = z.object({
  reset_token: z.string(),
  user_id: z.string(),
  expires_at: z.coerce.date()
});

// Input schema for creating password_resets (typically auto-generated token)
export const createPasswordResetInputSchema = z.object({
  user_id: z.string().min(1),
  expires_at: z.coerce.date() // Must be in the future, but enforce via app logic
});

// Input schema for updating password_resets (rarely updated, perhaps extend expiry)
export const updatePasswordResetInputSchema = z.object({
  reset_token: z.string(),
  user_id: z.string().min(1).optional(),
  expires_at: z.coerce.date().optional()
});

// Query/search schema for password_resets with defaults (limited, e.g., by user or token)
export const searchPasswordResetInputSchema = z.object({
  user_id: z.string().optional(),
  reset_token: z.string().optional(),
  limit: z.number().int().positive().max(50).default(10),
  offset: z.number().int().nonnegative().default(0),
  sort_by: z.enum(['reset_token', 'expires_at']).default('expires_at'),
  sort_order: z.enum(['asc', 'desc']).default('desc')
});

// Inferred types for password_resets
export type PasswordReset = z.infer<typeof passwordResetSchema>;
export type CreatePasswordResetInput = z.infer<typeof createPasswordResetInputSchema>;
export type UpdatePasswordResetInput = z.infer<typeof updatePasswordResetInputSchema>;
export type SearchPasswordResetInput = z.infer<typeof searchPasswordResetInputSchema>;