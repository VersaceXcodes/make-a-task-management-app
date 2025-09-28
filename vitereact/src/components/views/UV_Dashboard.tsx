import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '@/store/main';
import axios from 'axios';
import { z } from 'zod';


// From Zod schemas
const taskSchema = z.object({
  task_id: z.string(),
  user_id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  due_date: z.coerce.date().nullable(),
  priority: z.enum(['low', 'medium', 'high']).nullable(),
  category: z.string().nullable(),
  tags: z.string().nullable(),
  status: z.enum(['incomplete', 'completed', 'archived']), // Extended for FRD
  order_index: z.number().int().nonnegative(),
  share_expires_at: z.coerce.date().nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});
type Task = z.infer<typeof taskSchema>;

const createTaskInputSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().max(1000).nullable(),
  due_date: z.coerce.date().nullable(),
  priority: z.enum(['low', 'medium', 'high']).nullable(),
  category: z.string().min(1).max(100).nullable(),
  tags: z.string().max(500).nullable(),
  status: z.enum(['incomplete', 'completed', 'archived']).default('incomplete'),
  order_index: z.number().int().nonnegative().default(0),
  share_expires_at: z.coerce.date().nullable()
});
type CreateTaskInput = z.infer<typeof createTaskInputSchema>;

const updateTaskInputSchema = createTaskInputSchema.partial().extend({
  task_id: z.string()
});
type UpdateTaskInput = z.infer<typeof updateTaskInputSchema>;

const API_BASE = `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080'}/api`;

const UV_Dashboard: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const queryClient = useQueryClient();

  // Global store individual selectors
  const userId = useAppStore(state => state.authentication_state.current_user?.user_id);
  const authToken = useAppStore(state => state.authentication_state.auth_token);
  const isOffline = useAppStore(state => state.offline_status.is_offline);
  const addNotification = useAppStore(state => state.add_notification);
  const syncOffline = useAppStore(state => state.sync_offline);

  // Local states
  const [selectedTasks, setSelectedTasks] = useState<string[]>([]);
  const [modalState, setModalState] = useState({
    isOpen: false,
    type: 'add' as 'add' | 'edit',
    taskId: null as string | null,
    formData: { title: '', description: null, due_date: null, priority: null, category: null, tags: null } as Partial<CreateTaskInput>,
    error: null as string | null
  });
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, type: '' as 'delete' | 'archive' | 'bulkDelete' | 'bulkArchive', taskId: null as string | null, count: 0 });
  const [searchInput, setSearchInput] = useState(searchParams.get('search_query') || '');
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  // Filters and sort from params
  const filtersState = useMemo(() => ({
    status: (searchParams.get('filter_status') as 'all' | 'incomplete' | 'completed' | 'archived' | null) || 'all',
    category: searchParams.get('filter_category') || null,
    priority: (searchParams.get('filter_priority') as 'low' | 'medium' | 'high' | null) || null,
    tags: searchParams.get('filter_tags') || null,
    search: searchInput
  }), [searchParams, searchInput]);

  const sortState = useMemo(() => ({
    sort_by: (searchParams.get('sort_by') as 'due_date' | 'priority' | 'created_at' | 'order_index') || 'due_date',
    sort_order: (searchParams.get('sort_order') as 'asc' | 'desc') || 'asc'
  }), [searchParams]);

  const limit = parseInt(searchParams.get('limit') || '1000', 10);
  const offset = parseInt(searchParams.get('offset') || '0', 10);

  // Debounced search update
  useEffect(() => {
    const timeout = setTimeout(() => {
      setSearchParams(prev => {
        prev.set('search_query', searchInput);
        return prev;
      }, { replace: true });
    }, 300);
    return () => clearTimeout(timeout);
  }, [searchInput, setSearchParams]);

  // Query for tasks
  const { data: tasksList = [], isLoading, error } = useQuery({
    queryKey: ['tasks', userId, filtersState, sortState, limit, offset],
    queryFn: async () => {
      if (!userId || !authToken) throw new Error('Not authenticated');
      const params = new URLSearchParams({
        ...(filtersState.status !== 'all' && { filter_status: filtersState.status }),
        ...(filtersState.category && { filter_category: filtersState.category }),
        ...(filtersState.priority && { filter_priority: filtersState.priority }),
        ...(filtersState.tags && { filter_tags: filtersState.tags }),
        ...(filtersState.search && { search_query: filtersState.search }),
        sort_by: sortState.sort_by,
        sort_order: sortState.sort_order,
        limit: limit.toString(),
        offset: offset.toString()
      });
      const response = await axios.get(`${API_BASE}/tasks?${params}`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      return response.data.tasks as Task[];
    },
    enabled: !!userId && !!authToken,
    staleTime: 60000,
    refetchOnWindowFocus: false,
    retry: 1,
    select: (data) => data.sort((a, b) => {
      if (a.status !== 'incomplete' && b.status === 'incomplete') return 1;
      if (b.status !== 'incomplete' && a.status === 'incomplete') return -1;
      return 0;
    }) // Incomplete first
  });

  // Stats compute
  const stats = useMemo(() => {
    const now = new Date();
    const today = now.toDateString();
    const incomplete = tasksList.filter(t => t.status === 'incomplete').length;
    const dueToday = tasksList.filter(t => t.status === 'incomplete' && t.due_date?.toDateString() === today).length;
    return { incomplete_count: incomplete, due_today_count: dueToday };
  }, [tasksList]);

  // Sections compute
  const overdueTasks = useMemo(() => tasksList.filter(t => t.status === 'incomplete' && t.due_date && t.due_date < new Date()), [tasksList]);
  const todayTasks = useMemo(() => tasksList.filter(t => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return t.status !== 'archived' && t.due_date && t.due_date >= today && t.due_date < tomorrow;
  }), [tasksList]);
  const upcomingTasks = useMemo(() => tasksList.filter(t => {
    const now = new Date();
    const weekLater = new Date(now);
    weekLater.setDate(weekLater.getDate() + 7);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);
    return t.status !== 'archived' && t.due_date && t.due_date > todayEnd && t.due_date <= weekLater;
  }), [tasksList]);
  const filteredTasks = useMemo(() => tasksList.filter(t => t.status !== 'archived'), [tasksList]); // Main list excludes archived unless filtered

  // Overdue auto-scroll
  useEffect(() => {
    if (overdueTasks.length > 0) {
      const element = document.getElementById('overdue-section');
      element?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [overdueTasks.length]);

  // Mutations
  const createMutation = useMutation({
    mutationFn: async (data: CreateTaskInput) => {
      if (!authToken) throw new Error('No token');
      const response = await axios.post(`${API_BASE}/tasks`, data, { headers: { Authorization: `Bearer ${authToken}` } });
      return response.data as Task;
    },
    onSuccess: (newTask) => {
      queryClient.setQueryData(['tasks', userId, filtersState, sortState, limit, offset], (old: Task[] | undefined) => [...(old || []), newTask]);
      setModalState(prev => ({ ...prev, isOpen: false, formData: { title: '', description: null, due_date: null, priority: null, category: null, tags: null }, error: null }));
      addNotification({ type: 'success', message: 'Task added!', duration: 3000 });
    },
    onError: (err: any) => addNotification({ type: 'error', message: err.response?.data?.message || 'Failed to add task', duration: 3000 })
  });

  const updateMutation = useMutation({
    mutationFn: async ({ taskId, data }: { taskId: string; data: Partial<UpdateTaskInput> }) => {
      if (!authToken) throw new Error('No token');
      const response = await axios.patch(`${API_BASE}/tasks/${taskId}`, data, { headers: { Authorization: `Bearer ${authToken}` } });
      return response.data as Task;
    },
    onSuccess: (updatedTask) => {
      queryClient.setQueryData(['tasks', userId, filtersState, sortState, limit, offset], (old: Task[] | undefined) =>
        old?.map(t => t.task_id === updatedTask.task_id ? updatedTask : t) || []
      );
      addNotification({ type: 'success', message: 'Task updated!', duration: 3000 });
    },
    onError: (err: any) => addNotification({ type: 'error', message: err.response?.data?.message || 'Failed to update task', duration: 3000 })
  });

  const deleteMutation = useMutation({
    mutationFn: async (taskId: string) => {
      if (!authToken) throw new Error('No token');
      await axios.delete(`${API_BASE}/tasks/${taskId}`, { headers: { Authorization: `Bearer ${authToken}` } });
      return taskId;
    },
    onSuccess: (taskId) => {
      queryClient.setQueryData(['tasks', userId, filtersState, sortState, limit, offset], (old: Task[] | undefined) =>
        old?.filter(t => t.task_id !== taskId) || []
      );
      addNotification({ type: 'success', message: 'Task deleted!', duration: 3000 });
      setSelectedTasks(prev => prev.filter(id => id !== taskId));
    },
    onError: (err: any) => addNotification({ type: 'error', message: err.response?.data?.message || 'Failed to delete task', duration: 3000 })
  });

  const bulkCompleteMutation = useMutation({
    mutationFn: async (taskIds: string[]) => {
      if (!authToken) throw new Error('No token');
      const response = await axios.post(`${API_BASE}/tasks/bulk-complete`, { task_ids: taskIds }, { headers: { Authorization: `Bearer ${authToken}` } });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', userId] });
      setSelectedTasks([]);
      addNotification({ type: 'success', message: 'Tasks completed!', duration: 3000 });
    },
    onError: (err: any) => addNotification({ type: 'error', message: err.response?.data?.message || 'Failed to complete tasks', duration: 3000 })
  });

  const duplicateMutation = useMutation({
    mutationFn: async (taskId: string) => {
      if (!authToken) throw new Error('No token');
      const response = await axios.post(`${API_BASE}/tasks/${taskId}/duplicate`, {}, { headers: { Authorization: `Bearer ${authToken}` } });
      return response.data as Task;
    },
    onSuccess: (newTask) => {
      queryClient.setQueryData(['tasks', userId, filtersState, sortState, limit, offset], (old: Task[] | undefined) => [...(old || []), newTask]);
      addNotification({ type: 'success', message: 'Task duplicated!', duration: 3000 });
    },
    onError: (err: any) => addNotification({ type: 'error', message: err.response?.data?.message || 'Failed to duplicate task', duration: 3000 })
  });

  const shareMutation = useMutation({
    mutationFn: async (taskId: string) => {
      if (!authToken) throw new Error('No token');
      const response = await axios.post(`${API_BASE}/tasks/${taskId}/share`, {}, { headers: { Authorization: `Bearer ${authToken}` } });
      return response.data;
    },
    onSuccess: (data) => {
      navigator.clipboard.writeText(data.share_url);
      queryClient.setQueryData(['tasks', userId, filtersState, sortState, limit, offset], (old: Task[] | undefined) =>
        old?.map(t => t.task_id === data.task_id ? { ...t, share_expires_at: new Date(data.expires_at) } : t) || []
      );
      addNotification({ type: 'success', message: 'Link copied!', duration: 3000 });
      window.open(data.share_url, '_blank');
    },
    onError: (err: any) => addNotification({ type: 'error', message: err.response?.data?.message || 'Failed to share task', duration: 3000 })
  });

  const toggleStatusMutation = useMutation({
    mutationFn: async ({ taskId, status }: { taskId: string; status: 'incomplete' | 'completed' | 'archived' }) => {
      if (!authToken) throw new Error('No token');
      const response = await axios.patch(`${API_BASE}/tasks/${taskId}/toggle-status`, { status }, { headers: { Authorization: `Bearer ${authToken}` } });
      return response.data as Task;
    },
    onSuccess: (updatedTask) => {
      queryClient.setQueryData(['tasks', userId, filtersState, sortState, limit, offset], (old: Task[] | undefined) =>
        old?.map(t => t.task_id === updatedTask.task_id ? updatedTask : t) || []
      );
      if (updatedTask.status === 'completed') {
        setConfirmModal({ isOpen: true, type: 'archive', taskId: updatedTask.task_id, count: 1 });
      }
      addNotification({ type: 'success', message: 'Status updated!', duration: 3000 });
      setSelectedTasks(prev => prev.filter(id => id !== updatedTask.task_id));
    },
    onError: (err: any) => addNotification({ type: 'error', message: err.response?.data?.message || 'Failed to toggle status', duration: 3000 })
  });

  const reorderMutation = useMutation({
    mutationFn: async (order: string[]) => {
      if (!authToken) throw new Error('No token');
      const response = await axios.patch(`${API_BASE}/tasks/reorder`, { order }, { headers: { Authorization: `Bearer ${authToken}` } });
      return response.data as Task[];
    },
    onSuccess: (orderedTasks) => {
      queryClient.setQueryData(['tasks', userId, filtersState, sortState, limit, offset], orderedTasks);
      addNotification({ type: 'success', message: 'Tasks reordered!', duration: 3000 });
    },
    onError: (err: any) => addNotification({ type: 'error', message: err.response?.data?.message || 'Failed to reorder tasks', duration: 3000 })
  });

  // Handlers
  const handleFilterChange = useCallback((key: string, value: string | null) => {
    setSearchParams(prev => {
      if (value === null || value === '') {
        prev.delete(key);
      } else {
        prev.set(key, value);
      }
      if (key === 'search_query') prev.set('search_query', value || '');
      return prev;
    }, { replace: true });
  }, [setSearchParams]);

  const handleSortChange = useCallback((sortBy: string, sortOrder: 'asc' | 'desc') => {
    setSearchParams(prev => {
      prev.set('sort_by', sortBy);
      prev.set('sort_order', sortOrder);
      return prev;
    }, { replace: true });
  }, [setSearchParams]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => setSearchInput(e.target.value);

  const handleAddTask = () => {
    setModalState({ isOpen: true, type: 'add', taskId: null, formData: { title: '', description: null, due_date: null, priority: null, category: null, tags: null }, error: null });
  };

  const handleEditTask = (task: Task) => {
    setModalState({
      isOpen: true,
      type: 'edit',
      taskId: task.task_id,
      formData: {
        title: task.title,
        description: task.description,
        due_date: task.due_date,
        priority: task.priority,
        category: task.category,
        tags: task.tags
      },
      error: null
    });
  };

  const handleToggleSelect = (taskId: string, checked: boolean) => {
    setSelectedTasks(prev => checked ? [...prev, taskId] : prev.filter(id => id !== taskId));
  };



  const handleBulkComplete = () => bulkCompleteMutation.mutate(selectedTasks);

  const handleBulkDelete = () => setConfirmModal({ isOpen: true, type: 'bulkDelete', taskId: null, count: selectedTasks.length });

  const handleBulkArchive = () => {
    // Assume bulk update status to archived via updateMutation loop or extend endpoint
    selectedTasks.forEach(id => updateMutation.mutate({ taskId: id, data: { status: 'archived' } }));
    setSelectedTasks([]);
    addNotification({ type: 'success', message: 'Tasks archived!', duration: 3000 });
  };

  const handleToggleStatus = (task: Task) => {
    const newStatus = task.status === 'incomplete' ? 'completed' : 'incomplete';
    toggleStatusMutation.mutate({ taskId: task.task_id, status: newStatus });
  };

  const handleDeleteConfirm = (taskId?: string) => {
    if (taskId) deleteMutation.mutate(taskId);
    setConfirmModal({ isOpen: false, type: 'delete', taskId: null, count: 0 });
  };

  const handleArchiveConfirm = (taskId: string) => {
    updateMutation.mutate({ taskId, data: { status: 'archived' } });
    setConfirmModal({ isOpen: false, type: 'delete', taskId: null, count: 0 });
  };

  const handleUnarchive = (task: Task) => toggleStatusMutation.mutate({ taskId: task.task_id, status: 'incomplete' });

  const handleDuplicate = (taskId: string) => duplicateMutation.mutate(taskId);

  const handleShare = (taskId: string) => shareMutation.mutate(taskId);

  const handleSubmitModal = (e: React.FormEvent) => {
    e.preventDefault();
    const data = modalState.formData;
    if (!data.title?.trim()) {
      setModalState(prev => ({ ...prev, error: 'Title is required' }));
      return;
    }
    if (modalState.type === 'add') {
      createMutation.mutate(data as CreateTaskInput);
    } else if (modalState.taskId) {
      updateMutation.mutate({ taskId: modalState.taskId, data });
    }
  };

  const handleModalChange = (field: string, value: any) => {
    setModalState(prev => ({ ...prev, formData: { ...prev.formData, [field]: value }, error: null }));
  };

  const handleModalClose = () => {
    setModalState(prev => ({ ...prev, isOpen: false, error: null }));
  };

  const handleConfirmClose = () => setConfirmModal({ isOpen: false, type: 'delete', taskId: null, count: 0 });

  // Drag handlers
  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null) return;
    const newOrder = [...filteredTasks];
    const [draggedTask] = newOrder.splice(draggedIndex, 1);
    newOrder.splice(dropIndex, 0, draggedTask);
    const orderIds = newOrder.map(t => t.task_id);
    reorderMutation.mutate(orderIds);
    setDraggedIndex(null);
  }, [draggedIndex, filteredTasks, reorderMutation]);

  const handleClearFilters = () => {
    setSearchParams({});
    setSearchInput('');
  };

  if (error && !isOffline) {
    addNotification({ type: 'error', message: 'Failed to load tasks', duration: 3000 });
  }

  const isOverdue = (task: Task) => task.status === 'incomplete' && task.due_date && task.due_date < new Date();
  const getDueColor = (task: Task) => {
    if (!task.due_date) return 'gray';
    const due = task.due_date;
    const now = new Date();
    const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
    if (isOverdue(task)) return 'red';
    if (due.toDateString() === tomorrow.toDateString()) return 'yellow';
    return 'green';
  };
  const getPriorityIcon = (priority: 'low' | 'medium' | 'high' | null) => {
    switch (priority) {
      case 'high': return '!!';
      case 'medium': return '!';
      default: return '';
    }
  };
  const parseTags = (tags: string | null) => tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : [];


  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      {/* Offline Banner */}
      {isOffline && (
        <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded mb-4 flex justify-between items-center">
          <span>You're offline – changes will sync later</span>
          <button onClick={syncOffline} className="ml-4 bg-yellow-500 text-white px-3 py-1 rounded text-sm">Retry</button>
        </div>
      )}

      {/* Stats Bar */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="flex flex-col md:flex-row justify-between items-center text-gray-700 text-lg">
          <span>{stats.incomplete_count} incomplete tasks</span>
          <span>|</span>
          <button onClick={() => handleFilterChange('filter_status', todayTasks.length > 0 || overdueTasks.length > 0 ? 'incomplete' : null)} className="text-blue-600 hover:underline">
            {stats.due_today_count} due today
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="bg-white rounded-lg shadow p-4 mb-6 flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
        {/* Search */}
        <div className="relative flex-1 md:w-64">
          <input
            type="text"
            value={searchInput}
            onChange={handleSearchChange}
            placeholder="Search tasks..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Search tasks"
          />
          {searchInput && (
            <button onClick={() => { setSearchInput(''); handleClearFilters(); }} className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600">×</button>
          )}
        </div>

        {/* Filters Chips - Simplified toggles */}
        <div className="flex flex-wrap gap-2">
          <select
            value={filtersState.status}
            onChange={(e) => handleFilterChange('filter_status', e.target.value === 'all' ? null : e.target.value)}
            className="px-3 py-1 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Status</option>
            <option value="incomplete">Incomplete</option>
            <option value="completed">Completed</option>
            <option value="archived">Archived</option>
          </select>
          {/* Category/Priority/Tag selects - from user categories, simplify to inputs or static for MVP */}
          <select
            value={filtersState.priority || ''}
            onChange={(e) => handleFilterChange('filter_priority', e.target.value || null)}
            className="px-3 py-1 border border-gray-300 rounded-md"
          >
            <option value="">All Priority</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
          <input
            type="text"
            placeholder="Category"
            value={filtersState.category || ''}
            onChange={(e) => handleFilterChange('filter_category', e.target.value || null)}
            className="px-3 py-1 border border-gray-300 rounded-md w-32"
          />
          <input
            type="text"
            placeholder="Tags"
            value={filtersState.tags || ''}
            onChange={(e) => handleFilterChange('filter_tags', e.target.value || null)}
            className="px-3 py-1 border border-gray-300 rounded-md w-32"
          />
        </div>

        {/* Sort */}
        <div className="flex gap-2 items-center">
          <select
            value={sortState.sort_by}
            onChange={(e) => handleSortChange(e.target.value, sortState.sort_order)}
            className="px-3 py-1 border border-gray-300 rounded-md"
          >
            <option value="due_date">Due Date</option>
            <option value="priority">Priority</option>
            <option value="created_at">Creation Date</option>
            <option value="order_index">Custom Order</option>
          </select>
          <select
            value={sortState.sort_order}
            onChange={(e) => handleSortChange(sortState.sort_by, e.target.value as 'asc' | 'desc')}
            className="px-3 py-1 border border-gray-300 rounded-md"
          >
            <option value="asc">Asc</option>
            <option value="desc">Desc</option>
          </select>
        </div>

        {/* Clear Filters */}
        {(searchInput || filtersState.status !== 'all' || filtersState.category || filtersState.priority || filtersState.tags) && (
          <button onClick={handleClearFilters} className="text-blue-600 hover:text-blue-800 text-sm">Clear Filters</button>
        )}

        {/* Add Button */}
        <button onClick={handleAddTask} className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 ml-auto md:ml-0" aria-label="Add new task">
          + Add Task
        </button>
      </div>

      {/* Bulk Toolbar */}
      {selectedTasks.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 p-3 rounded-md mb-4 flex justify-between items-center">
          <span className="text-blue-700">{selectedTasks.length} tasks selected</span>
          <div className="flex gap-2">
            <button onClick={handleBulkComplete} className="text-green-600 hover:text-green-800">Mark Complete</button>
            <button onClick={handleBulkDelete} className="text-red-600 hover:text-red-800">Delete</button>
            <button onClick={handleBulkArchive} className="text-gray-600 hover:text-gray-800">Archive</button>
            <button onClick={() => setSelectedTasks([])} className="text-gray-500 hover:text-gray-700">Cancel</button>
          </div>
        </div>
      )}

      {/* Overdue Banner */}
      {overdueTasks.length > 0 && (
        <div id="overdue-section" className="bg-red-50 border border-red-200 p-4 rounded-md mb-4 flex justify-between items-center">
          <span className="text-red-700">You have {overdueTasks.length} overdue task{overdueTasks.length > 1 ? 's' : ''}!</span>
          <button onClick={() => handleFilterChange('filter_status', 'incomplete')} className="text-red-600 hover:text-red-800">View Overdue</button>
        </div>
      )}

      {/* Due Sections */}
      {todayTasks.length > 0 && (
        <section className="mb-6">
          <div className="bg-blue-100 text-blue-800 p-3 rounded-t-md font-semibold cursor-pointer" onClick={() => {/* Toggle expand, but always show for MVP */}}>
            Due Today: {todayTasks.length} tasks
          </div>
          <div className="bg-white rounded-b-md shadow">
            {/* Task List Render for todayTasks */}
            <ul className="divide-y divide-gray-200">
              {todayTasks.map((task, index) => (
                <li
                  key={task.task_id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, index)}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, index)}
                  className={`p-4 hover:bg-gray-50 ${isOverdue(task) ? 'bg-red-50' : ''}`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={selectedTasks.includes(task.task_id)}
                      onChange={(e) => handleToggleSelect(task.task_id, e.target.checked)}
                      className="rounded"
                      aria-label={`Select ${task.title}`}
                    />
                    <input
                      type="checkbox"
                      checked={task.status === 'completed'}
                      onChange={() => handleToggleStatus(task)}
                      className="rounded"
                      aria-label={`Toggle completion for ${task.title}`}
                    />
                    <div className="flex-1">
                      <h3 className={`font-medium ${task.status === 'completed' ? 'line-through text-green-600' : ''}`}>{task.title}</h3>
                      <span className={`inline-block px-2 py-1 rounded-full text-xs font-semibold ${getDueColor(task) === 'red' ? 'bg-red-100 text-red-800' : getDueColor(task) === 'yellow' ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'}`}>
                        Due: {task.due_date?.toLocaleDateString() || 'No date'}
                      </span>
                      {task.priority && <span className="ml-2">{getPriorityIcon(task.priority)}</span>}
                      {task.category && (
                        <button onClick={() => handleFilterChange('filter_category', task.category)} className="ml-2 px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">
                          {task.category}
                        </button>
                      )}
                      {parseTags(task.tags).map(tag => (
                        <button key={tag} onClick={() => handleFilterChange('filter_tags', tag)} className="ml-1 px-2 py-1 bg-gray-100 text-gray-800 text-xs rounded">
                          {tag}
                        </button>
                      ))}
                    </div>
                    <details className="ml-auto">
                      <summary className="cursor-pointer text-sm text-blue-600">Details</summary>
                      <div className="mt-2 p-2 bg-gray-50 rounded">
                        {task.description && <p>{task.description}</p>}
                        <div className="flex gap-2 mt-2">
                          <button onClick={() => handleEditTask(task)} className="text-blue-600">Edit</button>
                          <button onClick={() => handleDuplicate(task.task_id)} className="text-gray-600">Duplicate</button>
                          <button onClick={() => handleShare(task.task_id)} className="text-blue-600">Share</button>
                          <button onClick={() => setConfirmModal({ isOpen: true, type: 'delete', taskId: task.task_id, count: 1 })} className="text-red-600">Delete</button>
                          {task.status === 'completed' && <button onClick={() => setConfirmModal({ isOpen: true, type: 'archive', taskId: task.task_id, count: 1 })} className="text-gray-600">Archive</button>}
                        </div>
                      </div>
                    </details>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* Similar for Upcoming */}
      {upcomingTasks.length > 0 && (
        <section className="mb-6">
          <div className="bg-yellow-100 text-yellow-800 p-3 rounded-t-md font-semibold">Upcoming (next 7 days): {upcomingTasks.length} tasks</div>
          <div className="bg-white rounded-b-md shadow">
            <ul className="divide-y divide-gray-200">
              {upcomingTasks.map((task, index) => (
                <li key={task.task_id} className="p-4 hover:bg-gray-50">
                  {/* Same row structure as above */}
                  <div className="flex items-center gap-3">
                    <input type="checkbox" checked={selectedTasks.includes(task.task_id)} onChange={(e) => handleToggleSelect(task.task_id, e.target.checked)} className="rounded" />
                    <input type="checkbox" checked={task.status === 'completed'} onChange={() => handleToggleStatus(task)} className="rounded" />
                    <div className="flex-1">
                      <h3 className={task.status === 'completed' ? 'line-through text-green-600' : ''}>{task.title}</h3>
                      <span className="inline-block px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded">Due: {task.due_date?.toLocaleDateString()}</span>
                      {task.category && <button onClick={() => handleFilterChange('filter_category', task.category)} className="ml-2 px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">{task.category}</button>}
                    </div>
                    <details>
                      <summary className="cursor-pointer">Details</summary>
                      <div className="mt-2 p-2 bg-gray-50 rounded">
                        {task.description}
                        <div className="flex gap-2 mt-2">
                          <button onClick={() => handleEditTask(task)}>Edit</button>
                          <button onClick={() => handleDuplicate(task.task_id)}>Duplicate</button>
                          <button onClick={() => handleShare(task.task_id)}>Share</button>
                          <button onClick={() => setConfirmModal({ isOpen: true, type: 'delete', taskId: task.task_id, count: 1 })}>Delete</button>
                        </div>
                      </div>
                    </details>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* Main Task List */}
      <div className="bg-white rounded-lg shadow">
        <ul className="divide-y divide-gray-200" role="list" aria-label="Task list">
          {filteredTasks.map((task, index) => (
            <li
              key={task.task_id}
              draggable
              onDragStart={(e) => handleDragStart(e, index + (todayTasks.length + upcomingTasks.length))} // Adjust index for sections
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, index + (todayTasks.length + upcomingTasks.length))}
              className={`p-4 hover:bg-gray-50 ${isOverdue(task) ? 'bg-red-50 border-l-4 border-red-500' : ''} ${task.status === 'completed' ? 'opacity-60' : ''}`}
              tabIndex={0}
              aria-label={isOverdue(task) ? 'Overdue task' : 'Task row'}
            >
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={selectedTasks.includes(task.task_id)}
                  onChange={(e) => handleToggleSelect(task.task_id, e.target.checked)}
                  className="rounded focus:ring-blue-500"
                  aria-label={`Select ${task.title}`}
                />
                <input
                  type="checkbox"
                  checked={task.status === 'completed'}
                  onChange={() => handleToggleStatus(task)}
                  className={`rounded focus:ring-${task.status === 'completed' ? 'green' : 'blue'}-500`}
                  aria-label={`Mark ${task.title} as ${task.status === 'completed' ? 'incomplete' : 'complete'}`}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3
                      className={`font-medium cursor-pointer flex-1 min-w-0 ${task.status === 'completed' ? 'line-through text-green-600' : ''}`}
                      onDoubleClick={() => {/* Inline edit - open modal for simplicity */ handleEditTask(task)}}
                      tabIndex={0}
                    >
                      {task.title}
                    </h3>
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                      getDueColor(task) === 'red' ? 'bg-red-100 text-red-800' : 
                      getDueColor(task) === 'yellow' ? 'bg-yellow-100 text-yellow-800' : 
                      'bg-green-100 text-green-800'
                    }`}>
                      {task.due_date ? task.due_date.toLocaleDateString() : 'No due date'}
                    </span>
                    {task.priority && <span className={`text-xs font-bold ${task.priority === 'high' ? 'text-red-600' : 'text-yellow-600'}`}>
                      {getPriorityIcon(task.priority)}
                    </span>}
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {task.category && (
                      <button
                        onClick={() => handleFilterChange('filter_category', task.category)}
                        className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full hover:bg-blue-200"
                        aria-label={`Filter by category ${task.category}`}
                      >
                        {task.category}
                      </button>
                    )}
                    {parseTags(task.tags).map((tag, i) => (
                      <button
                        key={i}
                        onClick={() => handleFilterChange('filter_tags', tag)}
                        className="px-2 py-1 bg-gray-100 text-gray-800 text-xs rounded-full hover:bg-gray-200"
                        aria-label={`Filter by tag ${tag}`}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-2">
                  <span className="cursor-move text-gray-400" aria-label="Drag to reorder">⋮⋮</span>
                  <details className="relative">
                    <summary className="cursor-pointer text-gray-500 hover:text-gray-700 sr-only">Actions</summary>
                    <div className="absolute right-0 top-full mt-1 bg-white border rounded shadow-lg p-2 z-10 min-w-max">
                      <button onClick={() => handleEditTask(task)} className="block w-full text-left px-2 py-1 text-sm hover:bg-gray-100">Edit</button>
                      <button onClick={() => handleDuplicate(task.task_id)} className="block w-full text-left px-2 py-1 text-sm hover:bg-gray-100">Duplicate</button>
                      <button onClick={() => handleShare(task.task_id)} className="block w-full text-left px-2 py-1 text-sm hover:bg-gray-100">Share</button>
                      <button onClick={() => setConfirmModal({ isOpen: true, type: 'delete', taskId: task.task_id, count: 1 })} className="block w-full text-left px-2 py-1 text-red-600 text-sm hover:bg-gray-100">Delete</button>
                      {task.status === 'completed' && <button onClick={() => setConfirmModal({ isOpen: true, type: 'archive', taskId: task.task_id, count: 1 })} className="block w-full text-left px-2 py-1 text-sm hover:bg-gray-100">Archive</button>}
                      {task.status === 'archived' && <button onClick={() => handleUnarchive(task)} className="block w-full text-left px-2 py-1 text-green-600 text-sm hover:bg-gray-100">Unarchive</button>}
                    </div>
                  </details>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* Empty State */}
      {(!isLoading && tasksList.length === 0) && (
        <div className="text-center py-12">
          <div className="mx-auto h-24 w-24 text-gray-300 mb-4">📝</div> {/* Simple emoji icon */}
          <h2 className="text-2xl font-bold text-gray-900 mb-2">No tasks yet</h2>
          <p className="text-gray-600 mb-6">Add your first one to get started!</p>
          <button onClick={handleAddTask} className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700">Add Task</button>
        </div>
      )}

      {/* No Matches */}
      {(!isLoading && filteredTasks.length === 0 && (searchInput || Object.values(filtersState).some(v => v && v !== 'all'))) && (
        <div className="text-center py-12 bg-white rounded-lg shadow">
          <p className="text-gray-600 mb-4">No tasks match your search</p>
          <button onClick={handleClearFilters} className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700">Clear Filters</button>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {modalState.isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={handleModalClose}>
          <div className="bg-white rounded-lg p-6 w-full max-w-md max-h-full overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold mb-4">{modalState.type === 'add' ? 'Add Task' : 'Edit Task'}</h2>
            {modalState.error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded mb-4" role="alert" aria-live="polite">
                {modalState.error}
              </div>
            )}
            <form onSubmit={handleSubmitModal} className="space-y-4">
              <div>
                <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
                <input
                  id="title"
                  type="text"
                  value={modalState.formData.title || ''}
                  onChange={(e) => handleModalChange('title', e.target.value)}
                  className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${!modalState.formData.title ? 'border-red-500' : 'border-gray-300'}`}
                  required
                  autoFocus
                />
              </div>
              <div>
                <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  id="description"
                  value={modalState.formData.description || ''}
                  onChange={(e) => handleModalChange('description', e.target.value || null)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={3}
                />
              </div>
              <div>
                <label htmlFor="due_date" className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
                <input
                  id="due_date"
                  type="date"
                  value={modalState.formData.due_date ? modalState.formData.due_date.toISOString().split('T')[0] : ''}
                  onChange={(e) => handleModalChange('due_date', e.target.value ? new Date(e.target.value) : null)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="priority" className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                  <select
                    id="priority"
                    value={modalState.formData.priority || ''}
                    onChange={(e) => handleModalChange('priority', e.target.value as any || null)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">None</option>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="category" className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                  <input
                    type="text"
                    id="category"
                    value={modalState.formData.category || ''}
                    onChange={(e) => handleModalChange('category', e.target.value || null)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., Work"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="tags" className="block text-sm font-medium text-gray-700 mb-1">Tags (comma-separated)</label>
                <input
                  type="text"
                  id="tags"
                  value={modalState.formData.tags || ''}
                  onChange={(e) => handleModalChange('tags', e.target.value || null)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="urgent, meeting"
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button type="submit" disabled={createMutation.isPending || updateMutation.isPending} className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50">
                  {createMutation.isPending || updateMutation.isPending ? 'Saving...' : 'Save'}
                </button>
                <button type="button" onClick={handleModalClose} className="flex-1 bg-gray-300 text-gray-700 py-2 px-4 rounded-md hover:bg-gray-400">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm Modal */}
      {confirmModal.isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={handleConfirmClose}>
          <div className="bg-white rounded-lg p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold mb-4">
              {confirmModal.type === 'delete' ? `Delete ${confirmModal.taskId ? 'Task' : 'Tasks'}?` :
               confirmModal.type === 'bulkDelete' ? 'Delete Selected Tasks?' :
               confirmModal.type === 'archive' ? 'Archive Task?' : 'Archive Selected Tasks?'}
            </h2>
            <p className="text-gray-600 mb-6">
              {confirmModal.taskId ? `Delete "${tasksList.find(t => t.task_id === confirmModal.taskId)?.title}"? This cannot be undone.` :
               confirmModal.type.includes('bulk') ? `Delete ${confirmModal.count} tasks?` :
               'Archive this completed task?'}
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={handleConfirmClose} className="bg-gray-300 text-gray-700 py-2 px-4 rounded-md hover:bg-gray-400">Cancel</button>
              <button
                onClick={() => {
                  if (confirmModal.type === 'delete' && confirmModal.taskId) handleDeleteConfirm(confirmModal.taskId);
                  else if (confirmModal.type === 'bulkDelete') {
                    selectedTasks.forEach(id => deleteMutation.mutate(id));
                    setSelectedTasks([]);
                  } else if (confirmModal.type === 'archive' && confirmModal.taskId) handleArchiveConfirm(confirmModal.taskId);
                  else handleBulkArchive();
                }}
                className="bg-red-600 text-white py-2 px-4 rounded-md hover:bg-red-700"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Responsiveness: For cards, use md:table, but simplify with flex wrap */}
      <style>{`
        @media (max-width: 768px) {
          .task-row { flex-direction: column; gap: 0.5rem; }
          .task-row > div { flex: none; }
        }
      `}</style>
    </div>
  );
};

export default UV_Dashboard;