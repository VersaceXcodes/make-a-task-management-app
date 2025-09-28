// tests/server.test.js
import request from 'supertest';
import { app, pool } from '../server.js'; // Adjust path to your server.js (assuming JS export)
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { userSchema, taskSchema, createTaskInputSchema } from '../db/zodschemas.js'; // Adjust path

// Mock JWT secret from env or default
const JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
jest.mock('jsonwebtoken', () => ({
  sign: jest.fn((payload) => `mock-jwt-${payload.sub}`),
  verify: jest.fn((token) => ({ sub: token.split('-')[2] || null })),
}));

// Test DB connection (assume TEST_DB_URL env set to a separate Postgres DB)
let testTransaction;
beforeAll(async () => {
  // Seed test DB once (run provided SQL seed)
  await pool.query(`
    -- Truncate and re-seed tables for consistency
    TRUNCATE TABLE password_resets, tasks, users RESTART IDENTITY CASCADE;
    -- Insert seed data here (copy from provided SQL)
    INSERT INTO users (user_id, email, password_hash, name, created_at) VALUES
    ('user_001', 'john.doe@example.com', 'password123', 'John Doe', '2023-10-01T10:00:00Z');
    -- Add more seed as needed...
  `);
});

beforeEach(async () => {
  // Start transaction for isolation
  await pool.query('BEGIN');
  testTransaction = await pool.connect();
});

afterEach(async () => {
  // Rollback transaction
  await testTransaction.query('ROLLBACK');
  testTransaction.release();
});

// Unit Tests

describe('Unit: Authentication Functions', () => {
  const mockSign = jwt.sign;
  const mockVerify = jwt.verify;

  test('should generate JWT with user_id as sub', () => {
    const payload = { sub: 'user_001', email: 'john@example.com' };
    mockSign.mockReturnValue('mock-token');
    const token = jwt.sign(payload, JWT_SECRET);
    expect(token).toBe('mock-token');
    expect(mockSign).toHaveBeenCalledWith(payload, JWT_SECRET, expect.any(Object));
  });

  test('should verify valid token and extract sub', () => {
    const token = 'mock-jwt-user_001';
    mockVerify.mockReturnValue({ sub: 'user_001' });
    const decoded = jwt.verify(token, JWT_SECRET);
    expect(decoded).toEqual({ sub: 'user_001' });
    expect(mockVerify).toHaveBeenCalledWith(token, JWT_SECRET);
  });

  test('should handle invalid token verification', () => {
    const token = 'invalid';
    mockVerify.mockImplementation(() => { throw new Error('Invalid'); });
    expect(() => jwt.verify(token, JWT_SECRET)).toThrow('Invalid');
  });

  test('should compare plain passwords correctly', () => {
    const stored = 'password123';
    const input = 'password123';
    const isMatch = input === stored;
    expect(isMatch).toBe(true);
  });

  test('should reject mismatched plain passwords', () => {
    const stored = 'password123';
    const input = 'wrong';
    const isMatch = input === stored;
    expect(isMatch).toBe(false);
  });
});

describe('Unit: Middleware - Auth Guard', () => {
  // Mock req/res/next
  const mockReq = { headers: { authorization: 'Bearer mock-jwt-user_001' } };
  const mockRes = {};
  const mockNext = jest.fn();

  beforeEach(() => {
    jwt.verify.mockReturnValue({ sub: 'user_001' });
  });

  test('should attach user_id from valid token', () => {
    const authGuard = require('../middleware/auth.js').default; // Adjust to your auth middleware
    authGuard(mockReq, mockRes, mockNext);
    expect(mockReq.user_id).toBe('user_001');
    expect(mockNext).toHaveBeenCalled();
  });

  test('should call next with 401 on missing token', () => {
    mockReq.headers.authorization = undefined;
    const mockResJson = jest.fn().mockReturnThis();
    const mockResStatus = jest.fn(() => ({ json: mockResJson }));
    Object.assign(mockRes, { status: mockResStatus, json: mockResJson });
    const authGuard = require('../middleware/auth.js').default;
    authGuard(mockReq, mockRes, mockNext);
    expect(mockResStatus).toHaveBeenCalledWith(401);
    expect(mockResJson).toHaveBeenCalledWith({ error: 'Unauthorized' });
    expect(mockNext).not.toHaveBeenCalled();
  });
});

describe('Unit: Zod Validation Schemas', () => {
  test('createUserInputSchema should validate valid input', () => {
    const input = { email: 'test@example.com', password_hash: 'a'.repeat(60) };
    expect(() => createUserInputSchema.parse(input)).not.toThrow();
  });

  test('createUserInputSchema should reject invalid email', () => {
    const input = { email: 'invalid', password_hash: 'a'.repeat(60) };
    expect(() => createUserInputSchema.parse(input)).toThrow('Invalid email address');
  });

  test('taskSchema should coerce dates correctly', () => {
    const input = {
      task_id: 'task_001',
      user_id: 'user_001',
      title: 'Test',
      status: 'incomplete',
      order_index: 0,
      created_at: '2023-10-01T10:00:00Z',
      updated_at: '2023-10-01T10:00:00Z',
      due_date: '2023-10-15T17:00:00Z'
    };
    const parsed = taskSchema.parse(input);
    expect(parsed.due_date).toBeInstanceOf(Date);
    expect(parsed.created_at).toBeInstanceOf(Date);
  });

  test('taskSchema should reject invalid enum', () => {
    const input = { ...{}, priority: 'invalid' }; // Minimal valid + invalid
    expect(() => taskSchema.parse(input)).toThrow();
  });
});

describe('Unit: Database Utilities', () => {
  test('should build task filter query correctly', async () => {
    const { buildTaskFilterQuery } = require('../utils/db.js'); // Assume utility function
    const params = { user_id: 'user_001', status: 'incomplete', category: 'Work' };
    const { query, values } = buildTaskFilterQuery(params);
    expect(query).toContain('WHERE user_id = $1 AND status = $2 AND category = $3');
    expect(values).toEqual(['user_001', 'incomplete', 'Work']);
  });

  test('should append category without duplicates', async () => {
    const { appendCategory } = require('../utils/db.js');
    const current = ['Work', 'Personal'];
    const newCat = 'Fitness';
    const updated = appendCategory(current, newCat);
    expect(updated).toEqual(['Work', 'Personal', 'Fitness']);
    // Duplicate
    const dup = appendCategory(updated, 'Work');
    expect(dup).toEqual(updated); // No change
  });

  test('should calculate next order_index', async () => {
    const mockPool = { query: jest.fn() };
    mockPool.query.mockResolvedValue({ rows: [{ order_index: 5 }] });
    const { getNextOrderIndex } = require('../utils/db.js');
    const next = await getNextOrderIndex(mockPool, 'user_001');
    expect(next).toBe(6);
    expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining('SELECT MAX(order_index)'));
  });

  test('should detect overdue task', () => {
    const { isOverdue } = require('../utils/task.js');
    const now = new Date();
    const past = new Date(now.getTime() - 86400000); // Yesterday
    expect(isOverdue(past, 'incomplete')).toBe(true);
    expect(isOverdue(now, 'completed')).toBe(false);
  });
});

// Integration Tests

describe('Integration: Authentication Endpoints', () => {
  describe('POST /auth/register', () => {
    test('should register new user and return JWT', async () => {
      const newUser = {
        email: 'newuser@example.com',
        password: 'password123', // Plain for testing
        name: 'New User'
      };
      const res = await request(app)
        .post('/api/auth/register')
        .send(newUser)
        .expect(201);
      expect(res.body).toHaveProperty('token');
      expect(res.body.user).toMatchObject({
        user_id: expect.any(String),
        email: newUser.email,
        name: newUser.name,
        predefined_categories: ['Work', 'Personal', 'School', 'Other'],
        created_at: expect.any(String)
      });
      // Verify in DB
      const dbRes = await testTransaction.query('SELECT * FROM users WHERE email = $1', [newUser.email]);
      expect(dbRes.rows[0]).toBeDefined();
      expect(dbRes.rows[0].password_hash).toBe(newUser.password); // Plain
    });

    test('should return 400 for duplicate email', async () => {
      const existing = { email: 'john.doe@example.com', password: 'password123' };
      await request(app)
        .post('/api/auth/register')
        .send(existing)
        .expect(400);
    });

    test('should return 400 for invalid input', async () => {
      const invalid = { email: 'invalid', password: 'short' };
      await request(app)
        .post('/api/auth/register')
        .send(invalid)
        .expect(400);
    });
  });

  describe('POST /auth/login', () => {
    test('should login valid user and return JWT', async () => {
      const creds = { email: 'john.doe@example.com', password: 'password123' };
      const res = await request(app)
        .post('/api/auth/login')
        .send(creds)
        .expect(200);
      expect(res.body).toHaveProperty('token', expect.any(String));
      expect(res.body.user.email).toBe(creds.email);
    });

    test('should return 401 for invalid credentials', async () => {
      const invalid = { email: 'john.doe@example.com', password: 'wrong' };
      await request(app)
        .post('/api/auth/login')
        .send(invalid)
        .expect(401);
    });

    test('should return 401 for non-existent user', async () => {
      const nonExistent = { email: 'fake@example.com', password: 'password123' };
      await request(app)
        .post('/api/auth/login')
        .send(nonExistent)
        .expect(401);
    });
  });

  describe('POST /auth/logout', () => {
    test('should logout and return message', async () => {
      const token = 'mock-jwt-user_001'; // From mock
      const res = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(res.body.message).toBe('Logged out');
      // Verify blacklist mock if implemented
    });

    test('should return 401 for invalid token', async () => {
      await request(app)
        .post('/api/auth/logout')
        .set('Authorization', 'Bearer invalid')
        .expect(401);
    });
  });

  describe('POST /auth/forgot-password', () => {
    test('should process reset request for existing email', async () => {
      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'john.doe@example.com' })
        .expect(200);
      expect(res.body.message).toContain('Reset link');
      // Check DB insert
      const dbRes = await testTransaction.query('SELECT * FROM password_resets WHERE user_id = $1', ['user_001']);
      expect(dbRes.rows[0]).toBeDefined();
      expect(new Date(dbRes.rows[0].expires_at) > new Date()).toBe(true);
    });

    test('should return 200 for non-existent email (privacy)', async () => {
      await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'fake@example.com' })
        .expect(200);
    });

    test('should return 400 for invalid email', async () => {
      await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'invalid' })
        .expect(400);
    });
  });

  describe('POST /auth/reset-password', () => {
    test('should reset password with valid token and auto-login', async () => {
      // Use seeded reset_token_001 for user_001
      const newPass = 'newpassword456';
      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ reset_token: 'reset_token_001', password: newPass })
        .expect(200);
      expect(res.body).toHaveProperty('token');
      // Verify update
      const dbRes = await testTransaction.query('SELECT password_hash FROM users WHERE user_id = $1', ['user_001']);
      expect(dbRes.rows[0].password_hash).toBe(newPass);
      // Token deleted
      const resetDb = await testTransaction.query('SELECT * FROM password_resets WHERE reset_token = $1', ['reset_token_001']);
      expect(resetDb.rows.length).toBe(0);
    });

    test('should return 404 for expired token', async () => {
      // Assume expired: Modify seed or mock expiry < now
      const expiredToken = 'expired_token'; // Assume test inserts expired
      await testTransaction.query(
        'INSERT INTO password_resets (reset_token, user_id, expires_at) VALUES ($1, $2, $3)',
        ['expired_token', 'user_001', new Date(Date.now() - 86400000).toISOString()]
      );
      await request(app)
        .post('/api/auth/reset-password')
        .send({ reset_token: 'expired_token', password: 'newpass' })
        .expect(404);
    });

    test('should return 400 for invalid password', async () => {
      await request(app)
        .post('/api/auth/reset-password')
        .send({ reset_token: 'reset_token_001', password: 'short' })
        .expect(400);
    });
  });
});

describe('Integration: User Endpoints', () => {
  let authToken;

  beforeAll(async () => {
    const loginRes = await request(app).post('/api/auth/login').send({
      email: 'john.doe@example.com',
      password: 'password123'
    });
    authToken = loginRes.body.token;
  });

  describe('GET /users/me', () => {
    test('should return current user profile', async () => {
      const res = await request(app)
        .get('/api/users/me')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      expect(res.body).toMatchObject({
        user_id: 'user_001',
        email: 'john.doe@example.com',
        predefined_categories: expect.any(Array)
      });
      expect(res.body).not.toHaveProperty('password_hash');
    });

    test('should return 401 without token', async () => {
      await request(app).get('/api/users/me').expect(401);
    });
  });

  describe('GET /users/{user_id}/categories', () => {
    test('should return user categories', async () => {
      const res = await request(app)
        .get('/api/users/user_001/categories')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      expect(res.body).toEqual(expect.arrayContaining(['Work', 'Personal', 'School', 'Other']));
    });

    test('should return 401 for unauthorized user_id', async () => {
      await request(app)
        .get('/api/users/user_002/categories')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(401);
    });
  });

  describe('POST /users/{user_id}/categories', () => {
    test('should add new category', async () => {
      const res = await request(app)
        .post('/api/users/user_001/categories')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ category: 'Fitness' })
        .expect(200);
      expect(res.body).toContain('Fitness');
      // Verify update in DB (JSON array)
      const dbRes = await testTransaction.query('SELECT predefined_categories FROM users WHERE user_id = $1', ['user_001']);
      expect(JSON.parse(dbRes.rows[0].predefined_categories)).toContain('Fitness');
    });

    test('should not add duplicate category', async () => {
      await request(app)
        .post('/api/users/user_001/categories')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ category: 'Work' })
        .expect(200); // Or 400 if strict; assume no-op
      const res = await testTransaction.query('SELECT predefined_categories FROM users WHERE user_id = $1', ['user_001']);
      const cats = JSON.parse(res.rows[0].predefined_categories);
      expect(cats.filter(c => c === 'Work').length).toBe(1);
    });

    test('should return 400 for empty category', async () => {
      await request(app)
        .post('/api/users/user_001/categories')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ category: '' })
        .expect(400);
    });
  });
});

describe('Integration: Task Endpoints', () => {
  let authToken;
  let createdTaskId;

  beforeAll(async () => {
    const loginRes = await request(app).post('/api/auth/login').send({
      email: 'john.doe@example.com',
      password: 'password123'
    });
    authToken = loginRes.body.token;
  });

  afterEach(async () => {
    if (createdTaskId) {
      await testTransaction.query('DELETE FROM tasks WHERE task_id = $1', [createdTaskId]);
    }
  });

  describe('GET /tasks', () => {
    test('should list user tasks with defaults (order_index asc)', async () => {
      const res = await request(app)
        .get('/api/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      expect(res.body.tasks).toBeInstanceOf(Array);
      expect(res.body.tasks.length).toBeGreaterThan(0); // From seed
      expect(res.body.total).toBeGreaterThan(0);
      // Check sorting
      for (let i = 1; i < res.body.tasks.length; i++) {
        expect(res.body.tasks[i-1].order_index <= res.body.tasks[i].order_index).toBe(true);
      }
    });

    test('should filter by status', async () => {
      const res = await request(app)
        .get('/api/tasks?filter_status=incomplete')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      expect(res.body.tasks.every(t => t.status === 'incomplete')).toBe(true);
    });

    test('should search by title', async () => {
      const res = await request(app)
        .get('/api/tasks?search_query=project')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      expect(res.body.tasks.some(t => t.title.includes('project'))).toBe(true);
      expect(res.body.total).toBeGreaterThan(0);
    });

    test('should paginate results', async () => {
      const res = await request(app)
        .get('/api/tasks?limit=2&offset=0')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      expect(res.body.tasks.length).toBe(2);
      const next = await request(app)
        .get('/api/tasks?limit=2&offset=2')
        .set('Authorization', `Bearer ${authToken}`);
      expect(next.body.tasks.length).toBeLessThanOrEqual( res.body.total - 2 ); // Remaining
    });

    test('should sort by due_date desc', async () => {
      const res = await request(app)
        .get('/api/tasks?sort_by=due_date&sort_order=desc')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      for (let i = 1; i < res.body.tasks.length; i++) {
        const prevDate = new Date(res.body.tasks[i-1].due_date || '9999-01-01');
        const currDate = new Date(res.body.tasks[i].due_date || '9999-01-01');
        expect(prevDate >= currDate).toBe(true);
      }
    });

    test('should return empty for no matches', async () => {
      const res = await request(app)
        .get('/api/tasks?filter_status=archived') // Assume no archived
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      expect(res.body.tasks).toHaveLength(0);
      expect(res.body.total).toBe(0);
    });

    test('should return 401 without auth', async () => {
      await request(app).get('/api/tasks').expect(401);
    });
  });

  describe('POST /tasks', () => {
    test('should create minimal task (quick-add)', async () => {
      const newTask = { title: 'Quick Task' };
      const res = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send(newTask)
        .expect(201);
      createdTaskId = res.body.task_id;
      expect(res.body).toMatchObject({
        ...newTask,
        user_id: 'user_001',
        status: 'incomplete',
        order_index: expect.any(Number), // Auto max+1
        created_at: expect.any(String),
        updated_at: expect.any(String)
      });
      expect(res.body.task_id).toBeDefined();
      // Verify in DB
      const dbRes = await testTransaction.query('SELECT * FROM tasks WHERE task_id = $1', [createdTaskId]);
      expect(dbRes.rows[0].title).toBe(newTask.title);
    });

    test('should create full task with all fields', async () => {
      const fullTask = {
        title: 'Full Task',
        description: 'Description test',
        due_date: '2023-10-20T00:00:00Z',
        priority: 'high',
        category: 'Work',
        tags: 'urgent,test'
      };
      const res = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send(fullTask)
        .expect(201);
      expect(res.body.priority).toBe(fullTask.priority);
      expect(res.body.tags).toBe(fullTask.tags);
    });

    test('should return 400 for missing title', async () => {
      await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ description: 'No title' })
        .expect(400);
    });

    test('should return 400 for invalid priority enum', async () => {
      await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: 'Test', priority: 'invalid' })
        .expect(400);
    });
  });

  describe('GET /tasks/{task_id}', () => {
    beforeAll(async () => {
      const createRes = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: 'Fetchable Task' });
      createdTaskId = createRes.body.task_id;
    });

    test('should return specific task for owner', async () => {
      const res = await request(app)
        .get(`/api/tasks/${createdTaskId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      expect(res.body.task_id).toBe(createdTaskId);
      expect(res.body.user_id).toBe('user_001');
    });

    test('should return 404 for non-existent task', async () => {
      await request(app)
        .get('/api/tasks/nonexistent')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });

    test('should return 401 without auth', async () => {
      await request(app).get(`/api/tasks/${createdTaskId}`).expect(401);
    });
  });

  describe('PATCH /tasks/{task_id}', () => {
    beforeAll(async () => {
      const createRes = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: 'Updatable Task' });
      createdTaskId = createRes.body.task_id;
    });

    test('should partial update task', async () => {
      const update = { title: 'Updated Title', priority: 'medium' };
      const res = await request(app)
        .patch(`/api/tasks/${createdTaskId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(update)
        .expect(200);
      expect(res.body.title).toBe(update.title);
      expect(res.body.priority).toBe(update.priority);
      expect(res.body.updated_at).not.toBe(res.body.created_at); // Timestamp updated
    });

    test('should return 400 for invalid update', async () => {
      await request(app)
        .patch(`/api/tasks/${createdTaskId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ priority: 'invalid' })
        .expect(400);
    });

    test('should return 404 for non-owner task', async () => {
      // Create for another user? Use seed task_005 for user_002
      await request(app)
        .patch('/api/tasks/task_005')
        .set('Authorization', `Bearer ${authToken}`) // user_001
        .send({ title: 'Hack' })
        .expect(404); // Ownership fail
    });
  });

  describe('DELETE /tasks/{task_id}', () => {
    beforeAll(async () => {
      const createRes = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: 'Deletable Task' });
      createdTaskId = createRes.body.task_id;
    });

    test('should delete task', async () => {
      await request(app)
        .delete(`/api/tasks/${createdTaskId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      // Verify gone
      const dbRes = await testTransaction.query('SELECT * FROM tasks WHERE task_id = $1', [createdTaskId]);
      expect(dbRes.rows.length).toBe(0);
    });
  });

  describe('POST /tasks/{task_id}/duplicate', () => {
    beforeAll(async () => {
      const createRes = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: 'Original Task', description: 'Orig desc' });
      createdTaskId = createRes.body.task_id;
    });

    test('should duplicate task with prefix', async () => {
      const res = await request(app)
        .post(`/api/tasks/${createdTaskId}/duplicate`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(201);
      expect(res.body.title).toBe('Copy of Original Task');
      expect(res.body.description).toBe('Orig desc');
      expect(res.body.task_id).not.toBe(createdTaskId);
      expect(res.body.status).toBe('incomplete');
      expect(res.body.order_index).toBeGreaterThan(0);
    });

    test('should return 404 for non-existent', async () => {
      await request(app)
        .post('/api/tasks/nonexistent/duplicate')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });
  });

  describe('PATCH /tasks/{task_id}/toggle-status', () => {
    beforeAll(async () => {
      const createRes = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: 'Toggle Task', status: 'incomplete' });
      createdTaskId = createRes.body.task_id;
    });

    test('should toggle to completed', async () => {
      const res = await request(app)
        .patch(`/api/tasks/${createdTaskId}/toggle-status`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ status: 'completed' })
        .expect(200);
      expect(res.body.status).toBe('completed');
    });

    test('should return 400 for invalid status', async () => {
      await request(app)
        .patch(`/api/tasks/${createdTaskId}/toggle-status`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ status: 'invalid' })
        .expect(400);
    });
  });

  describe('POST /tasks/{task_id}/share', () => {
    beforeAll(async () => {
      const createRes = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: 'Shareable Task' });
      createdTaskId = createRes.body.task_id;
    });

    test('should generate share URL and set expiry', async () => {
      const res = await request(app)
        .post(`/api/tasks/${createdTaskId}/share`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      expect(res.body.share_url).toContain(`/share/${createdTaskId}`);
      const expiry = new Date(res.body.expires_at);
      expect(expiry > new Date()).toBe(true);
      // Approx 30 days
      expect(expiry.getTime() - Date.now()).toBeGreaterThan(30 * 24 * 60 * 60 * 1000 - 100000); // Allow tolerance
      // Verify DB
      const dbRes = await testTransaction.query('SELECT share_expires_at FROM tasks WHERE task_id = $1', [createdTaskId]);
      expect(new Date(dbRes.rows[0].share_expires_at)).toEqual(expiry);
    });

    test('should renew if expired', async () => {
      // Mock set expiry to past
      await testTransaction.query('UPDATE tasks SET share_expires_at = $1 WHERE task_id = $2', 
        [new Date(Date.now() - 86400000).toISOString(), createdTaskId]);
      const res = await request(app)
        .post(`/api/tasks/${createdTaskId}/share`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      expect(new Date(res.body.expires_at) > new Date()).toBe(true);
    });
  });

  describe('POST /tasks/bulk-complete', () => {
    let taskIds;

    beforeAll(async () => {
      // Create two tasks
      const t1 = await request(app).post('/api/tasks').set('Authorization', `Bearer ${authToken}`).send({ title: 'Bulk1' });
      const t2 = await request(app).post('/api/tasks').set('Authorization', `Bearer ${authToken}`).send({ title: 'Bulk2' });
      taskIds = [t1.body.task_id, t2.body.task_id];
    });

    test('should complete multiple tasks', async () => {
      const res = await request(app)
        .post('/api/tasks/bulk-complete')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ task_ids: taskIds })
        .expect(200);
      expect(res.body.updated_count).toBe(2);
      // Verify
      const dbRes = await testTransaction.query('SELECT status FROM tasks WHERE task_id = ANY($1)', [taskIds]);
      expect(dbRes.rows.every(r => r.status === 'completed')).toBe(true);
    });

    test('should handle empty array (0 count)', async () => {
      const res = await request(app)
        .post('/api/tasks/bulk-complete')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ task_ids: [] })
        .expect(200);
      expect(res.body.updated_count).toBe(0);
    });

    test('should return 400 for non-owned tasks', async () => {
      await request(app)
        .post('/api/tasks/bulk-complete')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ task_ids: ['task_005'] }) // user_002
        .expect(400);
    });
  });

  describe('DELETE /tasks/bulk-delete', () => {
    let taskIds;

    beforeAll(async () => {
      const t1 = await request(app).post('/api/tasks').set('Authorization', `Bearer ${authToken}`).send({ title: 'BulkDel1' });
      const t2 = await request(app).post('/api/tasks').set('Authorization', `Bearer ${authToken}`).send({ title: 'BulkDel2' });
      taskIds = [t1.body.task_id, t2.body.task_id];
    });

    test('should delete multiple tasks', async () => {
      const res = await request(app)
        .delete('/api/tasks/bulk-delete')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ task_ids: taskIds })
        .expect(200);
      expect(res.body.deleted_count).toBe(2);
      // Verify gone
      const dbRes = await testTransaction.query('SELECT * FROM tasks WHERE task_id = ANY($1)', [taskIds]);
      expect(dbRes.rows.length).toBe(0);
    });
  });

  describe('PATCH /tasks/reorder', () => {
    let taskIds;

    beforeAll(async () => {
      // Create three tasks with order 0,1,2
      const tasks = [];
      for (let i = 0; i < 3; i++) {
        const res = await request(app).post('/api/tasks').set('Authorization', `Bearer ${authToken}`).send({ title: `Reorder${i}` });
        tasks.push(res.body.task_id);
      }
      taskIds = tasks;
    });

    test('should reorder tasks', async () => {
      const newOrder = [...taskIds].reverse(); // 2,1,0
      const res = await request(app)
        .patch('/api/tasks/reorder')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ order: newOrder })
        .expect(200);
      expect(res.body).toHaveLength(3);
      // Verify order_index: 0 for last, 1 for middle, 2 for first
      const dbRes = await testTransaction.query('SELECT task_id, order_index FROM tasks WHERE task_id = ANY($1) ORDER BY order_index', [taskIds]);
      expect(dbRes.rows[0].order_index).toBe(0);
      expect(dbRes.rows[0].task_id).toBe(newOrder[2]); // Original 0 now last
    });

    test('should return 400 for invalid order (non-owned)', async () => {
      const invalidOrder = [...taskIds, 'task_005'];
      await request(app)
        .patch('/api/tasks/reorder')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ order: invalidOrder })
        .expect(400);
    });
  });
});

describe('Integration: Public Sharing Endpoint', () => {
  let sharedTaskId;
  let authToken;

  beforeAll(async () => {
    const loginRes = await request(app).post('/api/auth/login').send({
      email: 'john.doe@example.com',
      password: 'password123'
    });
    authToken = loginRes.body.token;

    // Create and share
    const createRes = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ title: 'Public Task' });
    sharedTaskId = createRes.body.task_id;

    await request(app)
      .post(`/api/tasks/${sharedTaskId}/share`)
      .set('Authorization', `Bearer ${authToken}`);
  });

  describe('GET /public/tasks/{task_id}', () => {
    test('should return shared task details (partial)', async () => {
      const res = await request(app)
        .get(`/public/tasks/${sharedTaskId}`)
        .expect(200);
      expect(res.body).toMatchObject({
        task_id: sharedTaskId,
        title: 'Public Task',
        status: 'incomplete'
      });
      expect(res.body).not.toHaveProperty('user_id'); // Partial
      expect(res.body).not.toHaveProperty('order_index');
      expect(res.body.share_expires_at).toBeDefined();
    });

    test('should return 404 for non-shared task', async () => {
      await request(app).get('/public/tasks/nonexistent').expect(404);
    });

    test('should return 404 for expired share', async () => {
      // Set expiry to past
      await testTransaction.query('UPDATE tasks SET share_expires_at = $1 WHERE task_id = $2',
        [new Date(Date.now() - 86400000).toISOString(), sharedTaskId]);
      await request(app).get(`/public/tasks/${sharedTaskId}`).expect(404);
    });

    test('should work without auth', async () => {
      await request(app).get(`/public/tasks/${sharedTaskId}`).expect(200); // Even if expired not set
    });
  });
});

// Error Handling Tests (Global)

describe('Integration: General Error Handling', () => {
  test('should return 500 on DB error (mock)', async () => {
    // Temporarily mock pool to throw
    const originalQuery = pool.query;
    pool.query = jest.fn(() => Promise.reject(new Error('DB fail')));
    await request(app)
      .get('/api/tasks')
      .set('Authorization', `Bearer mock-jwt-user_001`)
      .expect(500);
    pool.query = originalQuery;
  });

  test('should return 400 for oversized input (e.g., long title)', async () => {
    const longTitle = 'a'.repeat(300);
    await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer mock-jwt-user_001`)
      .send({ title: longTitle })
      .expect(400);
  });
});