import express from 'express';
import cors from "cors";
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { PGlite } from '@electric-sql/pglite';
import { fileURLToPath } from 'url';
import jwt from 'jsonwebtoken';
import morgan from 'morgan';
import { v4 as uuidv4 } from 'uuid';

// Import Zod schemas
import { 
  userSchema, 
  createUserInputSchema, 
  updateUserInputSchema, 
  searchUserInputSchema,
  taskSchema,
  createTaskInputSchema,
  updateTaskInputSchema,
  searchTaskInputSchema,
  passwordResetSchema,
  createPasswordResetInputSchema
} from './schema.ts';

dotenv.config();

// ESM workaround for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/*
 * Error response utility - creates consistent error responses across all endpoints
 * Provides structured error information with timestamps for debugging
 */
interface ErrorResponse {
  success: false;
  message: string;
  error_code?: string;
  details?: any;
  timestamp: string;
}

function createErrorResponse(
  message: string,
  error?: any,
  errorCode?: string
): ErrorResponse {
  const response: ErrorResponse = {
    success: false,
    message,
    timestamp: new Date().toISOString()
  };

  if (errorCode) {
    response.error_code = errorCode;
  }

  // Only include detailed error information in development
  if (error) {
    response.details = {
      name: error.name,
      message: error.message,
      stack: error.stack
    };
  }

  return response;
}

const { JWT_SECRET = 'your-secret-key' } = process.env;

/*
 * PGlite in-memory database setup for development/testing
 * This provides a full PostgreSQL-compatible database without requiring a server
 */
const db = new PGlite();

// Initialize database with schema
async function initializeDatabase() {
  try {
    // Create tables
    await db.exec(`
      CREATE TABLE IF NOT EXISTS users (
          user_id TEXT PRIMARY KEY,
          email TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          name TEXT,
          predefined_categories TEXT NOT NULL DEFAULT '["Work", "Personal", "School", "Other"]',
          created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS tasks (
          task_id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
          title TEXT NOT NULL,
          description TEXT,
          due_date TEXT,
          priority TEXT,
          category TEXT,
          tags TEXT,
          status TEXT NOT NULL DEFAULT 'incomplete',
          order_index INTEGER NOT NULL DEFAULT 0,
          share_expires_at TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS password_resets (
          reset_token TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
          expires_at TEXT NOT NULL
      );
    `);

    // Seed with test data
    await db.exec(`
      INSERT INTO users (user_id, email, password_hash, name, created_at) VALUES
      ('user_001', 'john.doe@example.com', 'password123', 'John Doe', '2023-10-01T10:00:00Z'),
      ('user_002', 'jane.smith@example.com', 'password456', 'Jane Smith', '2023-10-02T12:00:00Z'),
      ('user_003', 'test@example.com', 'test123', 'Test User', '2023-10-03T14:00:00Z')
      ON CONFLICT (email) DO NOTHING;

      INSERT INTO tasks (task_id, user_id, title, description, due_date, priority, category, tags, status, order_index, share_expires_at, created_at, updated_at) VALUES
      ('task_001', 'user_001', 'Complete project report', 'Write and finalize the quarterly project report with charts', '2023-10-15T17:00:00Z', 'high', 'Work', 'report,urgent,q4', 'incomplete', 1, NULL, '2023-10-01T10:30:00Z', '2023-10-01T10:30:00Z'),
      ('task_002', 'user_001', 'Grocery shopping', 'Buy milk, bread, and eggs from the store', '2023-10-07T18:00:00Z', 'low', 'Personal', 'shopping,essentials', 'incomplete', 2, '2023-10-08T18:00:00Z', '2023-10-01T11:00:00Z', '2023-10-01T11:00:00Z'),
      ('task_003', 'user_003', 'Test task', 'A test task for the test user', '2024-01-01T12:00:00Z', 'medium', 'Work', 'test', 'incomplete', 1, NULL, '2023-10-03T15:00:00Z', '2023-10-03T15:00:00Z')
      ON CONFLICT (task_id) DO NOTHING;
    `);

    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Database initialization failed:', error);
    throw error;
  }
}

// Initialize database on startup
await initializeDatabase();

const app = express();
const port = process.env.PORT || 3000;

// Middleware setup
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json({ limit: "5mb" }));
app.use(morgan('combined')); // Log all requests for development

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

/*
 * Authentication middleware for protected routes
 * Validates JWT token and sets req.user with user information
 * Returns 401 for missing/invalid tokens, 403 for expired tokens
 */
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json(createErrorResponse('Access token required', null, 'AUTH_TOKEN_MISSING'));
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const result = await db.query('SELECT user_id, email, name, predefined_categories, created_at FROM users WHERE user_id = $1', [decoded.user_id]);
    
    if (result.rows.length === 0) {
      return res.status(401).json(createErrorResponse('Invalid token - user not found', null, 'AUTH_USER_NOT_FOUND'));
    }

    // Parse predefined_categories JSON
    const user = result.rows[0];
    if (typeof user.predefined_categories === 'string') {
      user.predefined_categories = JSON.parse(user.predefined_categories);
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(403).json(createErrorResponse('Invalid or expired token', error, 'AUTH_TOKEN_INVALID'));
  }
};

// AUTHENTICATION ROUTES

/*
 * POST /api/auth/register - Register a new user account
 * Validates input, checks for unique email, creates user with plain text password
 * Generates JWT token for immediate login after registration
 */
app.post('/api/auth/register', async (req, res) => {
  try {
    // Validate input using Zod schema
    const validationResult = createUserInputSchema.safeParse({
      email: req.body.email?.toLowerCase().trim(),
      password_hash: req.body.password, // Store password directly (no hashing for development)
      name: req.body.name?.trim() || null,
      predefined_categories: ['Work', 'Personal', 'School', 'Other']
    });

    if (!validationResult.success) {
      return res.status(400).json(createErrorResponse('Validation failed', validationResult.error, 'VALIDATION_ERROR'));
    }

    const { email, password_hash, name, predefined_categories } = validationResult.data;

    // Additional password length check (since we're not using bcrypt validation)
    if (req.body.password?.length < 8) {
      return res.status(400).json(createErrorResponse('Password must be at least 8 characters long', null, 'PASSWORD_TOO_SHORT'));
    }

    // Check if user already exists
    const existingUser = await db.query('SELECT user_id FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json(createErrorResponse('User with this email already exists', null, 'USER_ALREADY_EXISTS'));
    }

    // Create new user with server-generated ID and timestamp
    const user_id = uuidv4();
    const created_at = new Date().toISOString();
    
    const result = await db.query(
      'INSERT INTO users (user_id, email, password_hash, name, predefined_categories, created_at) VALUES ($1, $2, $3, $4, $5, $6) RETURNING user_id, email, name, predefined_categories, created_at',
      [user_id, email, password_hash, name, JSON.stringify(predefined_categories), created_at]
    );

    const user = result.rows[0];
    user.predefined_categories = predefined_categories; // Return as array, not JSON string

    // Generate JWT token
    const token = jwt.sign(
      { user_id: user.user_id, email: user.email }, 
      JWT_SECRET, 
      { expiresIn: '7d' }
    );

    res.status(201).json({
      token,
      user
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json(createErrorResponse('Internal server error', error, 'INTERNAL_SERVER_ERROR'));
  }
});

/*
 * POST /api/auth/login - Authenticate existing user
 * Validates credentials with direct password comparison (no hashing)
 * Returns JWT token and user profile on successful authentication
 */
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json(createErrorResponse('Email and password are required', null, 'MISSING_REQUIRED_FIELDS'));
    }

    // Find user with direct password comparison
    const result = await db.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase().trim()]);
    if (result.rows.length === 0) {
      return res.status(401).json(createErrorResponse('Invalid email or password', null, 'INVALID_CREDENTIALS'));
    }

    const user = result.rows[0];

    // Check password (direct comparison for development)
    if (password !== user.password_hash) {
      return res.status(401).json(createErrorResponse('Invalid email or password', null, 'INVALID_CREDENTIALS'));
    }

    // Parse predefined_categories JSON
    if (typeof user.predefined_categories === 'string') {
      user.predefined_categories = JSON.parse(user.predefined_categories);
    }

    // Generate JWT token
    const token = jwt.sign(
      { user_id: user.user_id, email: user.email }, 
      JWT_SECRET, 
      { expiresIn: '7d' }
    );

    // Return user without password
    const { password_hash, ...userWithoutPassword } = user;

    res.json({
      token,
      user: userWithoutPassword
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json(createErrorResponse('Internal server error', error, 'INTERNAL_SERVER_ERROR'));
  }
});

/*
 * POST /api/auth/logout - Invalidate user session
 * For stateless JWT, this primarily serves as a confirmation endpoint
 * Client should discard the token after receiving this response
 */
app.post('/api/auth/logout', authenticateToken, (req, res) => {
  // For stateless JWT, logout is primarily client-side (discarding the token)
  // This endpoint serves as confirmation and could be extended for token blacklisting
  res.json({
    message: 'Logged out successfully'
  });
});

/*
 * POST /api/auth/forgot-password - Initiate password reset process
 * Creates reset token with expiration, simulates email sending for MVP
 * Stores reset token in password_resets table for validation
 */
app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json(createErrorResponse('Email is required', null, 'MISSING_EMAIL'));
    }

    const client = await pool.connect();
    
    try {
      // Check if user exists
      const userResult = await client.query('SELECT user_id FROM users WHERE email = $1', [email.toLowerCase().trim()]);
      
      // Always return 200 for security (don't reveal if email exists)
      if (userResult.rows.length === 0) {
        return res.status(200).json({
          message: 'If an account with that email exists, a reset link has been sent'
        });
      }

      const user_id = userResult.rows[0].user_id;

      // Delete any existing reset tokens for this user
      await client.query('DELETE FROM password_resets WHERE user_id = $1', [user_id]);

      // Create new reset token
      const reset_token = uuidv4();
      const expires_at = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour from now

      await client.query(
        'INSERT INTO password_resets (reset_token, user_id, expires_at) VALUES ($1, $2, $3)',
        [reset_token, user_id, expires_at]
      );

      res.status(200).json({
        message: 'If an account with that email exists, a reset link has been sent'
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json(createErrorResponse('Internal server error', error, 'INTERNAL_SERVER_ERROR'));
  }
});

/*
 * POST /api/auth/reset-password - Complete password reset process
 * Validates reset token and expiration, updates user password
 * Issues new JWT token for immediate login after reset
 */
app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { reset_token, password } = req.body;

    if (!reset_token || !password) {
      return res.status(400).json(createErrorResponse('Reset token and password are required', null, 'MISSING_REQUIRED_FIELDS'));
    }

    if (password.length < 8) {
      return res.status(400).json(createErrorResponse('Password must be at least 8 characters long', null, 'PASSWORD_TOO_SHORT'));
    }

    const client = await pool.connect();
    
    try {
      // Validate reset token and get user_id
      const resetResult = await client.query(
        'SELECT user_id FROM password_resets WHERE reset_token = $1 AND expires_at > $2',
        [reset_token, new Date().toISOString()]
      );

      if (resetResult.rows.length === 0) {
        return res.status(400).json(createErrorResponse('Invalid or expired reset token', null, 'INVALID_RESET_TOKEN'));
      }

      const user_id = resetResult.rows[0].user_id;

      // Update user password (direct storage for development)
      await client.query(
        'UPDATE users SET password_hash = $1 WHERE user_id = $2',
        [password, user_id]
      );

      // Delete the used reset token
      await client.query('DELETE FROM password_resets WHERE reset_token = $1', [reset_token]);

      // Get updated user info
      const userResult = await client.query(
        'SELECT user_id, email, name, predefined_categories, created_at FROM users WHERE user_id = $1',
        [user_id]
      );

      const user = userResult.rows[0];
      if (typeof user.predefined_categories === 'string') {
        user.predefined_categories = JSON.parse(user.predefined_categories);
      }

      // Generate new JWT token
      const token = jwt.sign(
        { user_id: user.user_id, email: user.email }, 
        JWT_SECRET, 
        { expiresIn: '7d' }
      );

      res.json({
        token,
        user
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json(createErrorResponse('Internal server error', error, 'INTERNAL_SERVER_ERROR'));
  }
});

// USER MANAGEMENT ROUTES

/*
 * GET /api/users/me - Get current user profile
 * Returns authenticated user's information excluding password
 * Parses JSON predefined_categories for frontend consumption
 */
app.get('/api/users/me', authenticateToken, (req, res) => {
  res.json({
    user: req.user
  });
});

/*
 * GET /api/users/{user_id}/categories - Get user's predefined categories
 * Returns array of category strings for dropdown population
 * Validates user_id matches authenticated user for security
 */
app.get('/api/users/:user_id/categories', authenticateToken, async (req, res) => {
  try {
    const { user_id } = req.params;

    // Ensure user can only access their own categories
    if (user_id !== req.user.user_id) {
      return res.status(403).json(createErrorResponse('Access denied', null, 'ACCESS_DENIED'));
    }

    res.json(req.user.predefined_categories);
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json(createErrorResponse('Internal server error', error, 'INTERNAL_SERVER_ERROR'));
  }
});

/*
 * POST /api/users/{user_id}/categories - Add new custom category
 * Appends category to user's predefined_categories JSON array
 * Prevents duplicates and validates category length
 */
app.post('/api/users/:user_id/categories', authenticateToken, async (req, res) => {
  try {
    const { user_id } = req.params;
    const { category } = req.body;

    // Ensure user can only modify their own categories
    if (user_id !== req.user.user_id) {
      return res.status(403).json(createErrorResponse('Access denied', null, 'ACCESS_DENIED'));
    }

    if (!category || category.trim().length === 0) {
      return res.status(400).json(createErrorResponse('Category name is required', null, 'MISSING_CATEGORY'));
    }

    if (category.length > 100) {
      return res.status(400).json(createErrorResponse('Category name too long', null, 'CATEGORY_TOO_LONG'));
    }

    const client = await pool.connect();
    
    try {
      // Get current categories
      const currentCategories = req.user.predefined_categories;

      // Check for duplicates
      if (currentCategories.includes(category.trim())) {
        return res.status(400).json(createErrorResponse('Category already exists', null, 'DUPLICATE_CATEGORY'));
      }

      // Add new category
      const updatedCategories = [...currentCategories, category.trim()];

      // Update in database
      await client.query(
        'UPDATE users SET predefined_categories = $1 WHERE user_id = $2',
        [JSON.stringify(updatedCategories), user_id]
      );

      res.json(updatedCategories);
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Add category error:', error);
    res.status(500).json(createErrorResponse('Internal server error', error, 'INTERNAL_SERVER_ERROR'));
  }
});

// TASK MANAGEMENT ROUTES

/*
 * GET /api/tasks - List tasks with filtering, searching, sorting, and pagination
 * Supports comprehensive filtering by status, category, priority, tags
 * Implements server-side search across title, description, and tags
 * Provides sorting by multiple fields and pagination with total count
 */
app.get('/api/tasks', authenticateToken, async (req, res) => {
  try {
    const {
      search_query,
      filter_status,
      filter_category,
      filter_priority,
      filter_tags,
      sort_by = 'order_index',
      sort_order = 'asc',
      limit: limitParam = '10',
      offset: offsetParam = '0'
    } = req.query;

    // Coerce query parameters
    const limit = Math.min(Math.max(parseInt(limitParam as string) || 10, 1), 1000);
    const offset = Math.max(parseInt(offsetParam as string) || 0, 0);

    // Build WHERE clause
    let whereConditions = ['user_id = $1'];
    let params = [req.user.user_id];
    let paramIndex = 2;

      // Apply filters
      if (filter_status) {
        whereConditions.push(`status = $${paramIndex}`);
        params.push(filter_status);
        paramIndex++;
      }

      if (filter_category) {
        whereConditions.push(`category = $${paramIndex}`);
        params.push(filter_category);
        paramIndex++;
      }

      if (filter_priority) {
        whereConditions.push(`priority = $${paramIndex}`);
        params.push(filter_priority);
        paramIndex++;
      }

      if (filter_tags) {
        whereConditions.push(`tags LIKE $${paramIndex}`);
        params.push(`%${filter_tags}%`);
        paramIndex++;
      }

      // Apply search query
      if (search_query) {
        whereConditions.push(`(title ILIKE $${paramIndex} OR description ILIKE $${paramIndex + 1} OR tags ILIKE $${paramIndex + 2})`);
        const searchPattern = `%${search_query}%`;
        params.push(searchPattern, searchPattern, searchPattern);
        paramIndex += 3;
      }

      const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

      // Validate sort parameters
      const validSortFields = ['title', 'due_date', 'priority', 'status', 'order_index', 'created_at', 'updated_at'];
      const validSortOrders = ['asc', 'desc'];
      
      const sortField = validSortFields.includes(sort_by) ? sort_by : 'order_index';
      const sortDirection = validSortOrders.includes(sort_order) ? sort_order : 'asc';

    // Get total count
    const countQuery = `SELECT COUNT(*) FROM tasks ${whereClause}`;
    const countResult = await db.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count);

    // Get tasks
    const tasksQuery = `
      SELECT task_id, user_id, title, description, due_date, priority, category, tags, status, order_index, share_expires_at, created_at, updated_at
      FROM tasks 
      ${whereClause}
      ORDER BY ${sortField} ${sortDirection}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    
    params.push(limit, offset);
    const tasksResult = await db.query(tasksQuery, params);

    res.json({
      tasks: tasksResult.rows,
      total
    });
  } catch (error) {
    console.error('List tasks error:', error);
    res.status(500).json(createErrorResponse('Internal server error', error, 'INTERNAL_SERVER_ERROR'));
  }
});

/*
 * POST /api/tasks - Create a new task
 * Validates input against schema, generates server-side ID and timestamps
 * Sets default order_index based on current maximum for user
 * Handles optional fields with proper null handling
 */
app.post('/api/tasks', authenticateToken, async (req, res) => {
  try {
    // Validate input
    const validationData = {
      user_id: req.user.user_id,
      title: req.body.title,
      description: req.body.description || null,
      due_date: req.body.due_date || null,
      priority: req.body.priority || null,
      category: req.body.category || null,
      tags: req.body.tags || null,
      status: req.body.status || 'incomplete',
      order_index: req.body.order_index !== undefined ? req.body.order_index : 0,
      share_expires_at: req.body.share_expires_at || null
    };

    const validationResult = createTaskInputSchema.safeParse(validationData);

    if (!validationResult.success) {
      return res.status(400).json(createErrorResponse('Validation failed', validationResult.error, 'VALIDATION_ERROR'));
    }

    // Get next order_index if not specified
    let order_index = validationData.order_index;
    if (order_index === 0) {
      const maxOrderResult = await db.query(
        'SELECT COALESCE(MAX(order_index), -1) + 1 as next_order FROM tasks WHERE user_id = $1',
        [req.user.user_id]
      );
      order_index = maxOrderResult.rows[0].next_order;
    }

    // Create task with server-generated values
    const task_id = uuidv4();
    const now = new Date().toISOString();

    const result = await db.query(
      `INSERT INTO tasks (task_id, user_id, title, description, due_date, priority, category, tags, status, order_index, share_expires_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [
        task_id,
        req.user.user_id,
        validationData.title,
        validationData.description,
        validationData.due_date,
        validationData.priority,
        validationData.category,
        validationData.tags,
        validationData.status,
        order_index,
        validationData.share_expires_at,
        now,
        now
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create task error:', error);
    res.status(500).json(createErrorResponse('Internal server error', error, 'INTERNAL_SERVER_ERROR'));
  }
});

/*
 * GET /api/tasks/{task_id} - Get specific task details
 * Validates ownership to ensure users can only access their own tasks
 * Returns full task object for detailed view/editing
 */
app.get('/api/tasks/:task_id', authenticateToken, async (req, res) => {
  try {
    const { task_id } = req.params;

    const client = await pool.connect();
    
    try {
      const result = await client.query(
        'SELECT * FROM tasks WHERE task_id = $1 AND user_id = $2',
        [task_id, req.user.user_id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json(createErrorResponse('Task not found', null, 'TASK_NOT_FOUND'));
      }

      res.json(result.rows[0]);
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Get task error:', error);
    res.status(500).json(createErrorResponse('Internal server error', error, 'INTERNAL_SERVER_ERROR'));
  }
});

/*
 * PATCH /api/tasks/{task_id} - Update specific task (partial updates)
 * Supports partial updates with proper validation
 * Updates timestamp automatically and validates ownership
 */
app.patch('/api/tasks/:task_id', authenticateToken, async (req, res) => {
  try {
    const { task_id } = req.params;

    const client = await pool.connect();
    
    try {
      // First verify task exists and user owns it
      const existingTask = await client.query(
        'SELECT * FROM tasks WHERE task_id = $1 AND user_id = $2',
        [task_id, req.user.user_id]
      );

      if (existingTask.rows.length === 0) {
        return res.status(404).json(createErrorResponse('Task not found', null, 'TASK_NOT_FOUND'));
      }

      // Build update fields
      const updateFields = [];
      const params = [];
      let paramIndex = 1;

      const allowedFields = ['title', 'description', 'due_date', 'priority', 'category', 'tags', 'status', 'order_index', 'share_expires_at'];

      for (const field of allowedFields) {
        if (req.body.hasOwnProperty(field)) {
          updateFields.push(`${field} = $${paramIndex}`);
          params.push(req.body[field]);
          paramIndex++;
        }
      }

      if (updateFields.length === 0) {
        return res.status(400).json(createErrorResponse('No valid fields to update', null, 'NO_UPDATE_FIELDS'));
      }

      // Always update updated_at
      updateFields.push(`updated_at = $${paramIndex}`);
      params.push(new Date().toISOString());
      paramIndex++;

      // Add WHERE conditions
      params.push(task_id, req.user.user_id);

      const updateQuery = `
        UPDATE tasks 
        SET ${updateFields.join(', ')}
        WHERE task_id = $${paramIndex - 1} AND user_id = $${paramIndex}
        RETURNING *
      `;

      const result = await client.query(updateQuery, params);
      res.json(result.rows[0]);
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Update task error:', error);
    res.status(500).json(createErrorResponse('Internal server error', error, 'INTERNAL_SERVER_ERROR'));
  }
});

/*
 * DELETE /api/tasks/{task_id} - Delete specific task
 * Permanently removes task from database
 * Validates ownership before deletion
 */
app.delete('/api/tasks/:task_id', authenticateToken, async (req, res) => {
  try {
    const { task_id } = req.params;

    const client = await pool.connect();
    
    try {
      const result = await client.query(
        'DELETE FROM tasks WHERE task_id = $1 AND user_id = $2 RETURNING task_id',
        [task_id, req.user.user_id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json(createErrorResponse('Task not found', null, 'TASK_NOT_FOUND'));
      }

      res.json({
        message: 'Task deleted successfully'
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Delete task error:', error);
    res.status(500).json(createErrorResponse('Internal server error', error, 'INTERNAL_SERVER_ERROR'));
  }
});

/*
 * POST /api/tasks/{task_id}/duplicate - Create copy of existing task
 * Copies all fields except ID, timestamps, and share expiration
 * Adds "Copy of " prefix to title and assigns new order_index
 */
app.post('/api/tasks/:task_id/duplicate', authenticateToken, async (req, res) => {
  try {
    const { task_id } = req.params;

    const client = await pool.connect();
    
    try {
      // Get original task
      const originalResult = await client.query(
        'SELECT * FROM tasks WHERE task_id = $1 AND user_id = $2',
        [task_id, req.user.user_id]
      );

      if (originalResult.rows.length === 0) {
        return res.status(404).json(createErrorResponse('Task not found', null, 'TASK_NOT_FOUND'));
      }

      const original = originalResult.rows[0];

      // Get next order_index
      const maxOrderResult = await client.query(
        'SELECT COALESCE(MAX(order_index), -1) + 1 as next_order FROM tasks WHERE user_id = $1',
        [req.user.user_id]
      );
      const order_index = maxOrderResult.rows[0].next_order;

      // Create duplicate with new ID and timestamps
      const new_task_id = uuidv4();
      const now = new Date().toISOString();

      const result = await client.query(
        `INSERT INTO tasks (task_id, user_id, title, description, due_date, priority, category, tags, status, order_index, share_expires_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         RETURNING *`,
        [
          new_task_id,
          req.user.user_id,
          `Copy of ${original.title}`,
          original.description,
          original.due_date,
          original.priority,
          original.category,
          original.tags,
          'incomplete', // Reset status to incomplete
          order_index,
          null, // No sharing for duplicated tasks
          now,
          now
        ]
      );

      res.status(201).json(result.rows[0]);
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Duplicate task error:', error);
    res.status(500).json(createErrorResponse('Internal server error', error, 'INTERNAL_SERVER_ERROR'));
  }
});

/*
 * PATCH /api/tasks/{task_id}/toggle-status - Toggle task completion status
 * Switches between 'incomplete' and 'completed' status
 * Updates timestamp and validates ownership
 */
app.patch('/api/tasks/:task_id/toggle-status', authenticateToken, async (req, res) => {
  try {
    const { task_id } = req.params;
    const { status } = req.body;

    if (!status || !['incomplete', 'completed'].includes(status)) {
      return res.status(400).json(createErrorResponse('Valid status required (incomplete or completed)', null, 'INVALID_STATUS'));
    }

    const client = await pool.connect();
    
    try {
      const result = await client.query(
        'UPDATE tasks SET status = $1, updated_at = $2 WHERE task_id = $3 AND user_id = $4 RETURNING *',
        [status, new Date().toISOString(), task_id, req.user.user_id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json(createErrorResponse('Task not found', null, 'TASK_NOT_FOUND'));
      }

      res.json(result.rows[0]);
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Toggle status error:', error);
    res.status(500).json(createErrorResponse('Internal server error', error, 'INTERNAL_SERVER_ERROR'));
  }
});

/*
 * POST /api/tasks/{task_id}/share - Generate/update share link for task
 * Sets share_expires_at to 30 days from now if null or expired
 * Returns shareable URL and expiration timestamp
 */
app.post('/api/tasks/:task_id/share', authenticateToken, async (req, res) => {
  try {
    const { task_id } = req.params;

    const client = await pool.connect();
    
    try {
      // Check if task exists and user owns it
      const taskResult = await client.query(
        'SELECT share_expires_at FROM tasks WHERE task_id = $1 AND user_id = $2',
        [task_id, req.user.user_id]
      );

      if (taskResult.rows.length === 0) {
        return res.status(404).json(createErrorResponse('Task not found', null, 'TASK_NOT_FOUND'));
      }

      const currentExpiry = taskResult.rows[0].share_expires_at;
      const now = new Date();
      const expiryDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days from now

      // Update expiry if null or expired
      let expires_at = currentExpiry;
      if (!currentExpiry || new Date(currentExpiry) <= now) {
        expires_at = expiryDate.toISOString();
        
        await client.query(
          'UPDATE tasks SET share_expires_at = $1, updated_at = $2 WHERE task_id = $3 AND user_id = $4',
          [expires_at, now.toISOString(), task_id, req.user.user_id]
        );
      }

      res.json({
        share_url: `${req.protocol}://${req.get('host')}/share/${task_id}`,
        expires_at
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Share task error:', error);
    res.status(500).json(createErrorResponse('Internal server error', error, 'INTERNAL_SERVER_ERROR'));
  }
});

/*
 * POST /api/tasks/bulk-complete - Mark multiple tasks as completed
 * Validates ownership of all tasks before updating any
 * Returns count of successfully updated tasks
 */
app.post('/api/tasks/bulk-complete', authenticateToken, async (req, res) => {
  try {
    const { task_ids } = req.body;

    if (!task_ids || !Array.isArray(task_ids) || task_ids.length === 0) {
      return res.status(400).json(createErrorResponse('Valid task_ids array required', null, 'INVALID_TASK_IDS'));
    }

    const client = await pool.connect();
    
    try {
      // First validate all tasks belong to user
      const validationResult = await client.query(
        'SELECT COUNT(*) FROM tasks WHERE task_id = ANY($1) AND user_id = $2',
        [task_ids, req.user.user_id]
      );

      const validCount = parseInt(validationResult.rows[0].count);
      if (validCount !== task_ids.length) {
        return res.status(400).json(createErrorResponse('Some tasks not found or access denied', null, 'INVALID_TASK_ACCESS'));
      }

      // Update all tasks to completed
      const updateResult = await client.query(
        'UPDATE tasks SET status = $1, updated_at = $2 WHERE task_id = ANY($3) AND user_id = $4',
        ['completed', new Date().toISOString(), task_ids, req.user.user_id]
      );

      res.json({
        updated_count: updateResult.rowCount
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Bulk complete error:', error);
    res.status(500).json(createErrorResponse('Internal server error', error, 'INTERNAL_SERVER_ERROR'));
  }
});

/*
 * DELETE /api/tasks/bulk-delete - Delete multiple tasks
 * Validates ownership of all tasks before deleting any
 * Returns count of successfully deleted tasks
 */
app.delete('/api/tasks/bulk-delete', authenticateToken, async (req, res) => {
  try {
    const { task_ids } = req.body;

    if (!task_ids || !Array.isArray(task_ids) || task_ids.length === 0) {
      return res.status(400).json(createErrorResponse('Valid task_ids array required', null, 'INVALID_TASK_IDS'));
    }

    const client = await pool.connect();
    
    try {
      // First validate all tasks belong to user
      const validationResult = await client.query(
        'SELECT COUNT(*) FROM tasks WHERE task_id = ANY($1) AND user_id = $2',
        [task_ids, req.user.user_id]
      );

      const validCount = parseInt(validationResult.rows[0].count);
      if (validCount !== task_ids.length) {
        return res.status(400).json(createErrorResponse('Some tasks not found or access denied', null, 'INVALID_TASK_ACCESS'));
      }

      // Delete all tasks
      const deleteResult = await client.query(
        'DELETE FROM tasks WHERE task_id = ANY($1) AND user_id = $2',
        [task_ids, req.user.user_id]
      );

      res.json({
        deleted_count: deleteResult.rowCount
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Bulk delete error:', error);
    res.status(500).json(createErrorResponse('Internal server error', error, 'INTERNAL_SERVER_ERROR'));
  }
});

/*
 * PATCH /api/tasks/reorder - Reorder tasks by updating order_index
 * Takes array of task_ids in desired order and updates order_index accordingly
 * Validates ownership of all tasks before reordering
 */
app.patch('/api/tasks/reorder', authenticateToken, async (req, res) => {
  try {
    const { order } = req.body;

    if (!order || !Array.isArray(order) || order.length === 0) {
      return res.status(400).json(createErrorResponse('Valid order array required', null, 'INVALID_ORDER'));
    }

    const client = await pool.connect();
    
    try {
      // First validate all tasks belong to user
      const validationResult = await client.query(
        'SELECT COUNT(*) FROM tasks WHERE task_id = ANY($1) AND user_id = $2',
        [order, req.user.user_id]
      );

      const validCount = parseInt(validationResult.rows[0].count);
      if (validCount !== order.length) {
        return res.status(400).json(createErrorResponse('Some tasks not found or access denied', null, 'INVALID_TASK_ACCESS'));
      }

      // Update order_index for each task
      const now = new Date().toISOString();
      const updatePromises = order.map((task_id, index) => {
        return client.query(
          'UPDATE tasks SET order_index = $1, updated_at = $2 WHERE task_id = $3 AND user_id = $4',
          [index, now, task_id, req.user.user_id]
        );
      });

      await Promise.all(updatePromises);

      // Return updated tasks in new order
      const result = await client.query(
        'SELECT * FROM tasks WHERE task_id = ANY($1) AND user_id = $2 ORDER BY order_index ASC',
        [order, req.user.user_id]
      );

      res.json(result.rows);
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Reorder tasks error:', error);
    res.status(500).json(createErrorResponse('Internal server error', error, 'INTERNAL_SERVER_ERROR'));
  }
});

/*
 * GET /api/public/tasks/{task_id} - Get shared task (public, no auth required)
 * Returns read-only task information if share link is valid and not expired
 * Excludes sensitive information like user_id and order_index
 */
app.get('/api/public/tasks/:task_id', async (req, res) => {
  try {
    const { task_id } = req.params;

    const client = await pool.connect();
    
    try {
      const result = await client.query(
        'SELECT task_id, title, description, due_date, priority, category, tags, status, share_expires_at FROM tasks WHERE task_id = $1 AND share_expires_at > $2',
        [task_id, new Date().toISOString()]
      );

      if (result.rows.length === 0) {
        return res.status(404).json(createErrorResponse('Shared task not found or expired', null, 'SHARED_TASK_NOT_FOUND'));
      }

      res.json(result.rows[0]);
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Get shared task error:', error);
    res.status(500).json(createErrorResponse('Internal server error', error, 'INTERNAL_SERVER_ERROR'));
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// SPA catch-all: serve index.html for non-API routes only
app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

export { app, db };

// Start the server
app.listen(port, '0.0.0.0', () => {
  console.log(`Server running on port ${port} and listening on 0.0.0.0`);
});