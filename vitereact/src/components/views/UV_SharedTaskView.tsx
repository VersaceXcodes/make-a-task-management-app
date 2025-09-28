import React, { useCallback, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAppStore } from '@/store/main';
import axios from 'axios';
import { z } from 'zod';
// Define task schema locally to match backend
const taskSchema = z.object({
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

type Task = z.infer<typeof taskSchema>;

const API_BASE = `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080'}/api`;

const UV_SharedTaskView: React.FC = () => {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const addNotification = useAppStore((state) => state.add_notification);

  const fetchSharedTask = useCallback(async (id: string): Promise<Task> => {
    const response = await axios.get(`${API_BASE}/public/tasks/${id}`);
    const parsed = taskSchema.safeParse(response.data);
    if (!parsed.success) {
      throw new Error('Invalid task data');
    }
    const task = parsed.data;
    if (task.share_expires_at && task.share_expires_at < new Date()) {
      throw new Error('expired');
    }
    return task;
  }, []);

  const { data: singleTask, isLoading, error } = useQuery<Task>({
    queryKey: ['shared-task', taskId],
    queryFn: () => fetchSharedTask(taskId || ''),
    enabled: !!taskId,
    staleTime: 60000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  // Handle errors with useEffect since onError is deprecated
  useEffect(() => {
    if (error) {
      const message = error.message === 'expired' ? 'This shared link has expired' : 'This shared link is invalid or expired';
      addNotification({ type: 'error', message, duration: 5000 });
      setTimeout(() => navigate('/'), 5000);
    }
  }, [error, addNotification, navigate]);

  const isOverdue = (dueDate: Date | null, status: 'incomplete' | 'completed') => dueDate && dueDate < new Date() && status === 'incomplete';
  const isUpcoming = (dueDate: Date | null) => dueDate && dueDate > new Date() && dueDate.getDate() - new Date().getDate() <= 7;
  const getDueBadgeClass = (dueDate: Date | null, status: 'incomplete' | 'completed') => {
    if (!dueDate) return 'bg-gray-100 text-gray-800';
    if (isOverdue(dueDate, status)) return 'bg-red-100 text-red-800';
    if (isUpcoming(dueDate)) return 'bg-yellow-100 text-yellow-800';
    return 'bg-green-100 text-green-800';
  };
  const getDueText = (dueDate: Date | null) => dueDate ? `Due: ${dueDate.toLocaleDateString()}` : 'No due date';

  const getPriorityIcon = (priority: 'low' | 'medium' | 'high' | null) => {
    if (priority === 'high') return <span className="text-red-500 font-bold">!!</span>;
    if (priority === 'medium') return <span className="text-yellow-500 font-bold">!</span>;
    return <span className="text-gray-500">Priority: Low</span>;
  };

  const renderTags = (tags: string | null) => {
    if (!tags) return null;
    const tagArray = tags.split(',').slice(0, 5).map(tag => tag.trim()).filter(Boolean);
    return (
      <div className="flex flex-wrap gap-1">
        {tagArray.map((tag, index) => (
          <span key={index} className="bg-gray-100 text-gray-700 px-2 py-1 rounded-full text-xs">
            {tag}
          </span>
        ))}
      </div>
    );
  };

  const isCompleted = singleTask?.status === 'completed';
  const titleClass = `text-2xl font-bold ${isCompleted ? 'line-through text-green-600' : 'text-gray-900'}`;

  if (isLoading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50" aria-label="Loading shared task">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </main>
    );
  }

  if (error || !singleTask) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50" aria-live="polite">
        <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8 border border-red-200 bg-red-50">
          <h1 className="text-2xl font-bold text-red-900 mb-4 text-center">Invalid Shared Link</h1>
          <p className="text-red-700 mb-6 text-center">This shared link is invalid or expired. Please request a new one.</p>
          <div className="space-y-3">
            <Link
              to="/"
              className="block w-full bg-blue-600 text-white text-center py-3 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              aria-label="Back to TaskHub homepage"
            >
              Back to TaskHub
            </Link>
            <Link
              to="/"
              className="block w-full bg-green-600 text-white text-center py-3 px-4 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
              aria-label="Get started with TaskHub"
            >
              Get Started
            </Link>
          </div>
        </div>
      </main>
    );
  }

  addNotification({ type: 'success', message: 'Try TaskHub for free!', duration: 3000 });

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8" aria-label="Read-only shared task details" role="main">
      <div className="max-w-md w-full space-y-8 transition-opacity duration-300 opacity-100">
        <h1 className="text-3xl font-bold text-center text-gray-900">
          Shared Task: {singleTask.title}
        </h1>
        <div className="bg-white shadow-md rounded-lg p-6">
          <div className="space-y-4">
            <h2 className={titleClass}>{singleTask.title}</h2>
            <p className="text-sm text-gray-600">
              {singleTask.description || 'No description provided.'}
            </p>
            {singleTask.due_date && (
              <span className={`inline-flex ${getDueBadgeClass(singleTask.due_date, singleTask.status)}`}>
                {getDueText(singleTask.due_date)}
              </span>
            )}
            <div className="text-sm">
              {getPriorityIcon(singleTask.priority)}
            </div>
            {singleTask.category && (
              <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs">
                {singleTask.category}
              </span>
            )}
            {renderTags(singleTask.tags)}
            <p className={`text-sm ${isCompleted ? 'line-through text-green-600' : 'text-gray-900'}`}>
              Status: {isCompleted ? 'Complete' : 'Incomplete'}
            </p>
          </div>
          <div className="mt-6 pt-4 border-t border-gray-200">
            <Link
              to="/"
              className="block w-full bg-blue-600 text-white text-center py-3 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 font-medium"
              aria-label="Navigate back to TaskHub homepage"
              tabIndex={0}
            >
              Back to TaskHub
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
};

export default UV_SharedTaskView;