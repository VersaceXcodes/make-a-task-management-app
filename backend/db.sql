-- Create the users table
CREATE TABLE IF NOT EXISTS users (
    user_id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT,
    predefined_categories JSON NOT NULL DEFAULT '["Work", "Personal", "School", "Other"]',
    created_at TEXT NOT NULL
);

-- Create the tasks table
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

-- Create the password_resets table
CREATE TABLE IF NOT EXISTS password_resets (
    reset_token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL
);

-- Seed the users table with example data (plain text passwords for testing)
INSERT INTO users (user_id, email, password_hash, name, created_at) VALUES
('user_001', 'john.doe@example.com', 'password123', 'John Doe', '2023-10-01T10:00:00Z'),
('user_002', 'jane.smith@example.com', 'password456', 'Jane Smith', '2023-10-02T12:00:00Z'),
('user_003', 'alice.johnson@example.com', 'admin123', 'Alice Johnson', '2023-10-03T14:00:00Z'),
('user_004', 'bob.wilson@example.com', 'user123', 'Bob Wilson', '2023-10-04T16:00:00Z'),
('user_005', 'charlie.brown@example.com', 'password789', 'Charlie Brown', '2023-10-05T18:00:00Z');

-- Seed the tasks table with example data (multiple tasks per user, covering various fields)
INSERT INTO tasks (task_id, user_id, title, description, due_date, priority, category, tags, status, order_index, share_expires_at, created_at, updated_at) VALUES
-- Tasks for user_001
('task_001', 'user_001', 'Complete project report', 'Write and finalize the quarterly project report with charts', '2023-10-15T17:00:00Z', 'high', 'Work', 'report,urgent,q4', 'incomplete', 1, NULL, '2023-10-01T10:30:00Z', '2023-10-01T10:30:00Z'),
('task_002', 'user_001', 'Grocery shopping', 'Buy milk, bread, and eggs from the store', '2023-10-07T18:00:00Z', 'low', 'Personal', 'shopping,essentials', 'incomplete', 2, '2023-10-08T18:00:00Z', '2023-10-01T11:00:00Z', '2023-10-01T11:00:00Z'),
('task_003', 'user_001', 'Study for exam', 'Review chapters 5-8 for the upcoming math exam', NULL, 'medium', 'School', 'study,exam', 'incomplete', 3, NULL, '2023-10-02T09:00:00Z', '2023-10-02T09:00:00Z'),
('task_004', 'user_001', 'Call dentist', 'Schedule appointment for cleaning', '2023-10-10T14:00:00Z', 'medium', 'Personal', 'appointment,health', 'completed', 4, NULL, '2023-10-02T10:00:00Z', '2023-10-06T15:00:00Z'),
-- Tasks for user_002
('task_005', 'user_002', 'Team meeting prep', 'Prepare slides and agenda for the weekly team sync', '2023-10-08T11:00:00Z', 'high', 'Work', 'meeting,slides', 'incomplete', 1, NULL, '2023-10-02T13:00:00Z', '2023-10-02T13:00:00Z'),
('task_006', 'user_002', 'Exercise routine', '30 minutes of jogging in the park', NULL, 'low', 'Personal', 'fitness,jogging', 'incomplete', 2, NULL, '2023-10-03T07:00:00Z', '2023-10-03T07:00:00Z'),
('task_007', 'user_002', 'Research paper draft', 'Outline and draft introduction for academic paper', '2023-10-12T20:00:00Z', 'high', 'School', 'research,draft', 'incomplete', 3, NULL, '2023-10-03T15:00:00Z', '2023-10-03T15:00:00Z'),
('task_008', 'user_002', 'Fix bug in code', 'Debug the authentication issue in the login module', NULL, 'high', 'Work', 'bug,debug,auth', 'completed', 4, NULL, '2023-10-04T09:00:00Z', '2023-10-05T12:00:00Z'),
-- Tasks for user_003
('task_009', 'user_003', 'Client call', 'Discuss project requirements with client over video', '2023-10-09T16:00:00Z', 'high', 'Work', 'client,call', 'incomplete', 1, '2023-10-10T16:00:00Z', '2023-10-03T14:30:00Z', '2023-10-03T14:30:00Z'),
('task_010', 'user_003', 'Read book chapter', 'Chapter 3 of the new novel for book club', NULL, 'low', 'Personal', 'reading,bookclub', 'incomplete', 2, NULL, '2023-10-04T19:00:00Z', '2023-10-04T19:00:00Z'),
-- Tasks for user_004
('task_011', 'user_004', 'Budget planning', 'Review monthly expenses and adjust budget', '2023-10-11T10:00:00Z', 'medium', 'Personal', 'finance,budget', 'incomplete', 1, NULL, '2023-10-04T11:00:00Z', '2023-10-04T11:00:00Z'),
('task_012', 'user_004', 'Submit assignment', 'Upload the essay to the online portal', '2023-10-06T23:59:00Z', 'high', 'School', 'assignment,submit', 'completed', 2, NULL, '2023-10-05T08:00:00Z', '2023-10-06T22:00:00Z'),
-- Tasks for user_005
('task_013', 'user_005', 'Product design review', 'Review wireframes with the design team', '2023-10-14T15:00:00Z', 'medium', 'Work', 'design,review', 'incomplete', 1, NULL, '2023-10-05T12:00:00Z', '2023-10-05T12:00:00Z'),
('task_014', 'user_005', 'Clean garage', 'Organize tools and discard old items', NULL, 'low', 'Personal', 'cleaning,organize', 'incomplete', 2, NULL, '2023-10-05T20:00:00Z', '2023-10-05T20:00:00Z');

-- Seed the password_resets table with example data
INSERT INTO password_resets (reset_token, user_id, expires_at) VALUES
('reset_token_001', 'user_001', '2023-10-08T10:00:00Z'),
('reset_token_002', 'user_002', '2023-10-09T12:00:00Z'),
('reset_token_003', 'user_003', '2023-10-10T14:00:00Z');
```