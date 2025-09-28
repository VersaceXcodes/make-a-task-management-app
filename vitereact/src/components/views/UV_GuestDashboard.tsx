import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { useAppStore } from '@/store/main';
import type { z } from 'zod';
// Define task schema locally since import path is not available
const taskSchema = z.object({
  task_id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  status: z.enum(['incomplete', 'completed', 'archived']),
  due_date: z.date().nullable(),
  priority: z.enum(['low', 'medium', 'high']).nullable(),
  category: z.string().nullable(),
  tags: z.string().nullable(),
  created_at: z.date(),
  updated_at: z.date(),
});

type Task = z.infer<typeof taskSchema>;

const UV_GuestDashboard: React.FC = () => {
  const { session_id } = useParams<{ session_id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();

  // Local state
  const [tasks_list, setTasks_list] = useState<Task[]>([]);
  const [filters_state, setFilters_state] = useState({
    status: (searchParams.get('status') as 'all' | 'incomplete' | 'completed' | null) || 'all',
    category: searchParams.get('category') || null,
    priority: searchParams.get('priority') as 'low' | 'medium' | 'high' | null || null,
    tags: searchParams.get('tags') || null,
    search: searchParams.get('search') || '',
  });
  const [sort_state, setSort_state] = useState({
    sort_by: (searchParams.get('sort_by') as any || 'order_index'),
    sort_order: (searchParams.get('sort_order') as 'asc' | 'desc') || 'asc',
  });
  const [selected_tasks, setSelected_tasks] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [modals_state, setModals_state] = useState({
    add_modal_open: false,
    edit_task_id: null as string | null,
    form_data: { 
      title: '', 
      description: null as string | null, 
      due_date: null as Date | null, 
      priority: null as 'low' | 'medium' | 'high' | null, 
      category: null as string | null, 
      tags: null as string | null 
    },
  });
  const [guest_limit_reached, setGuest_limit_reached] = useState(false);
  const [limit_modal_open, setLimit_modal_open] = useState(false);
  const [confirm_modal, setConfirm_modal] = useState<{ open: boolean; type: 'delete' | 'bulk'; task_id?: string; count?: number }>({ open: false, type: 'delete', task_id: undefined, count: 0 });
  const [search_timeout, setSearch_timeout] = useState<NodeJS.Timeout | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Global store individual selectors
  const is_guest = useAppStore((state) => state.authentication_state.is_guest);
  const is_offline = useAppStore((state) => state.offline_status.is_offline);
  const add_notification = useAppStore((state) => state.add_notification);

  const storage_key = `guest_tasks_${session_id || `guest_${Date.now()}`}`;

  // Ensure guest mode
  useEffect(() => {
    if (!is_guest) {
      window.location.href = '/';
    }
    // Generate session_id if missing
    if (!session_id) {
      const new_id = `guest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      window.history.replaceState({}, '', `/guest-dashboard/${new_id}`);
    }
  }, [is_guest, session_id]);

  // Fetch from sessionStorage
  const fetchGuestTasks = useCallback(() => {
    try {
      const stored = sessionStorage.getItem(storage_key);
      if (stored) {
        const parsed = JSON.parse(stored) as Task[];
        // Validate with zod (loose)
        const valid = parsed.filter((t) => taskSchema.safeParse(t).success);
        setTasks_list(valid);
        add_notification({ type: 'warning', message: 'Guest session restored!', duration: 3000 });
      } else {
        setTasks_list([]);
        add_notification({ type: 'warning', message: 'New guest session – data will be lost on refresh!', duration: 5000 });
      }
    } catch (e) {
      setTasks_list([]);
      add_notification({ type: 'error', message: 'Session load error – starting fresh!', duration: 3000 });
    }
    setGuest_limit_reached(false);
  }, [storage_key, add_notification]);

  useEffect(() => {
    fetchGuestTasks();
    // Listen for storage changes (multi-tab)
    const handleStorage = (e: StorageEvent) => {
      if (e.key === storage_key && e.storageArea === sessionStorage) {
        fetchGuestTasks();
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [fetchGuestTasks]);

  // Save to sessionStorage
  const saveToStorage = useCallback((tasks: Task[]) => {
    try {
      sessionStorage.setItem(storage_key, JSON.stringify(tasks));
    } catch (e) {
      add_notification({ type: 'error', message: 'Storage full – clear browser data!', duration: 5000 });
    }
  }, [storage_key, add_notification]);

  // Computed stats
  const stats = useMemo(() => {
    const count = tasks_list.length;
    const incomplete = tasks_list.filter((t) => t.status === 'incomplete').length;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due_today = tasks_list.filter((t) => t.due_date && new Date(t.due_date) >= today && new Date(t.due_date) < new Date(today.getTime() + 86400000) && t.status === 'incomplete').length;
    const limit_reached = count >= 5;
    setGuest_limit_reached(limit_reached);
    return { incomplete_count: incomplete, due_today_count: due_today, guest_count: count };
  }, [tasks_list]);

  // Filtered and sorted tasks
  const applySort = useCallback((tasks: Task[], sort: typeof sort_state) => {
    return [...tasks].sort((a, b) => {
      let valA = a[sort.sort_by as keyof Task] as any;
      let valB = b[sort.sort_by as keyof Task] as any;
      if (valA instanceof Date) valA = valA.getTime();
      if (valB instanceof Date) valB = valB.getTime();
      if (valA == null) valA = '';
      if (valB == null) valB = '';
      if (valA < valB) return sort.sort_order === 'asc' ? -1 : 1;
      if (valA > valB) return sort.sort_order === 'asc' ? 1 : -1;
      return 0;
    });
  }, []);

  const applyFilters = useCallback((tasks: Task[], filters: typeof filters_state) => {
    return tasks.filter((task) => {
      if (filters.status !== 'all' && task.status !== filters.status) return false;
      if (filters.category && task.category !== filters.category) return false;
      if (filters.priority && task.priority !== filters.priority) return false;
      if (filters.tags && task.tags && !task.tags.includes(filters.tags)) return false;
      if (filters.search && task.title.toLowerCase().includes(filters.search.toLowerCase())) return true;
      if (filters.search && task.description?.toLowerCase().includes(filters.search.toLowerCase())) return true;
      if (filters.search && task.tags?.toLowerCase().includes(filters.search.toLowerCase())) return true;
      if (!filters.search) return true;
      return false;
    });
  }, []);

  const filtered_tasks = useMemo(() => applyFilters(applySort(tasks_list, sort_state), filters_state), [tasks_list, sort_state, filters_state, applySort, applyFilters]);

  const overdue_tasks = useMemo(() => filtered_tasks.filter((t) => t.due_date && new Date(t.due_date) < new Date() && t.status === 'incomplete'), [filtered_tasks]);

  // Update URL on filter/sort/search change
  useEffect(() => {
    const params = new URLSearchParams();
    if (filters_state.status !== 'all') params.set('status', filters_state.status);
    if (filters_state.category) params.set('category', filters_state.category);
    if (filters_state.priority) params.set('priority', filters_state.priority);
    if (filters_state.tags) params.set('tags', filters_state.tags);
    if (filters_state.search) params.set('search', filters_state.search);
    if (sort_state.sort_by !== 'order_index') params.set('sort_by', sort_state.sort_by);
    if (sort_state.sort_order !== 'asc') params.set('sort_order', sort_state.sort_order);
    setSearchParams(params, { replace: true });
  }, [filters_state, sort_state, setSearchParams]);

  // Debounced search update
  const handleSearchChange = useCallback((value: string) => {
    if (search_timeout) clearTimeout(search_timeout);
    const newTimeout = setTimeout(() => {
      setFilters_state(prev => ({ ...prev, search: value }));
    }, 300);
    setSearch_timeout(newTimeout);
  }, [search_timeout]);

  // Actions
  const checkGuestLimit = useCallback(() => {
    if (stats.guest_count >= 5) {
      add_notification({ type: 'warning', message: 'Max 5 tasks in guest mode!', duration: 4000 });
      setLimit_modal_open(true);
      return false;
    }
    return true;
  }, [stats.guest_count, add_notification]);

  const addTask = useCallback(async () => {
    setError(null);
    const result = createTaskInputSchema.safeParse(modals_state.form_data);
    if (!result.success) {
      const errs = result.error.errors.map(e => e.message).join(', ');
      add_notification({ type: 'error', message: `Validation: ${errs}`, duration: 5000 });
      return;
    }
    if (!checkGuestLimit()) return;

    setLoading(true);
    const newTask: Task = {
      task_id: crypto.randomUUID?.() || `temp_${Date.now()}_${Math.random()}`,
      title: result.data.title,
      description: result.data.description,
      due_date: result.data.due_date,
      priority: result.data.priority,
      category: result.data.category,
      tags: result.data.tags,
      status: 'incomplete',
      order_index: tasks_list.length,
      share_expires_at: null,
      created_at: new Date(),
      updated_at: new Date(),
      // No user_id for guest
    };
    await new Promise(resolve => setTimeout(resolve, 500)); // Simulate async
    setTasks_list(prev => {
      const updated = [...prev, newTask];
      saveToStorage(updated);
      return updated;
    });
    setModals_state({ add_modal_open: false, edit_task_id: null, form_data: { title: '', description: null, due_date: null, priority: null, category: null, tags: null } });
    add_notification({ type: 'success', message: 'Task added!', duration: 3000 });
    setLoading(false);
  }, [modals_state.form_data, tasks_list.length, checkGuestLimit, saveToStorage, add_notification]);

  const editTask = useCallback((id: string) => {
    const task = tasks_list.find(t => t.task_id === id);
    if (!task) return;
    setModals_state({
      add_modal_open: true,
      edit_task_id: id,
      form_data: {
        title: task.title,
        description: task.description,
        due_date: task.due_date,
        priority: task.priority,
        category: task.category,
        tags: task.tags,
      },
    });
  }, [tasks_list]);

  const updateTask = useCallback(async () => {
    setError(null);
    const result = createTaskInputSchema.safeParse(modals_state.form_data);
    if (!result.success) {
      const errs = result.error.errors.map(e => e.message).join(', ');
      add_notification({ type: 'error', message: `Validation: ${errs}`, duration: 5000 });
      return;
    }

    setLoading(true);
    const updatedTask: Partial<Task> = {
      ...result.data,
      updated_at: new Date(),
    };
    await new Promise(resolve => setTimeout(resolve, 500));
    setTasks_list(prev => {
      const updated = prev.map(t => t.task_id === modals_state.edit_task_id ? { ...t, ...updatedTask } : t);
      saveToStorage(updated);
      return updated;
    });
    setModals_state({ add_modal_open: false, edit_task_id: null, form_data: { title: '', description: null, due_date: null, priority: null, category: null, tags: null } });
    add_notification({ type: 'success', message: 'Task updated!', duration: 3000 });
    setLoading(false);
  }, [modals_state, saveToStorage, add_notification]);

  const toggleStatus = useCallback((id: string) => {
    setLoading(true);
    setTasks_list(prev => {
      const updated = prev.map(t => t.task_id === id ? { ...t, status: t.status === 'incomplete' ? 'completed' : 'incomplete', updated_at: new Date() } : t);
      saveToStorage(updated);
      return updated;
    });
    add_notification({ type: 'success', message: 'Status toggled!', duration: 2000 });
    setLoading(false);
  }, [saveToStorage, add_notification]);

  const deleteTask = useCallback((id: string) => {
    setConfirm_modal({ open: true, type: 'delete', task_id: id, count: 0 });
  }, []);

  const confirmDelete = useCallback(() => {
    if (!confirm_modal.task_id) return;
    setLoading(true);
    setTasks_list(prev => {
      const updated = prev.filter(t => t.task_id !== confirm_modal.task_id);
      saveToStorage(updated);
      setSelected_tasks(prev => prev.filter(id => id !== confirm_modal.task_id));
      return updated;
    });
    add_notification({ type: 'success', message: 'Task deleted!', duration: 3000 });
    setConfirm_modal({ open: false, type: 'delete', task_id: undefined, count: 0 });
    setLoading(false);
  }, [confirm_modal.task_id, saveToStorage, add_notification]);

  const duplicateTask = useCallback((id: string) => {
    if (!checkGuestLimit()) return;
    const task = tasks_list.find(t => t.task_id === id);
    if (!task) return;
    const dup: Task = {
      ...task,
      task_id: crypto.randomUUID?.() || `dup_${Date.now()}_${Math.random()}`,
      title: `Copy of ${task.title}`,
      status: 'incomplete',
      order_index: tasks_list.length,
      created_at: new Date(),
      updated_at: new Date(),
      share_expires_at: null,
    };
    setTasks_list(prev => {
      const updated = [...prev, dup];
      saveToStorage(updated);
      return updated;
    });
    add_notification({ type: 'success', message: 'Task duplicated!', duration: 3000 });
  }, [tasks_list, checkGuestLimit, saveToStorage, add_notification]);

  const bulkComplete = useCallback(() => {
    if (selected_tasks.length === 0) return;
    setConfirm_modal({ open: true, type: 'bulk', count: selected_tasks.length, task_id: undefined });
  }, [selected_tasks]);

  const confirmBulkComplete = useCallback(() => {
    setLoading(true);
    setTasks_list(prev => {
      const updated = prev.map(t => selected_tasks.includes(t.task_id) ? { ...t, status: 'completed', updated_at: new Date() } : t);
      saveToStorage(updated);
      return updated;
    });
    setSelected_tasks([]);
    add_notification({ type: 'success', message: `${confirm_modal.count} tasks completed!`, duration: 3000 });
    setConfirm_modal({ open: false, type: 'delete', task_id: undefined, count: 0 });
    setLoading(false);
  }, [selected_tasks, saveToStorage, add_notification, confirm_modal.count]);

  const bulkDelete = useCallback(() => {
    if (selected_tasks.length === 0) return;
    setConfirm_modal({ open: true, type: 'bulk', count: selected_tasks.length, task_id: undefined });
  }, [selected_tasks]);

  const confirmBulkDelete = useCallback(() => {
    setLoading(true);
    setTasks_list(prev => {
      const updated = prev.filter(t => !selected_tasks.includes(t.task_id));
      saveToStorage(updated);
      return updated;
    });
    setSelected_tasks([]);
    add_notification({ type: 'success', message: `${confirm_modal.count} tasks deleted!`, duration: 3000 });
    setConfirm_modal({ open: false, type: 'delete', task_id: undefined, count: 0 });
    setLoading(false);
  }, [selected_tasks, saveToStorage, add_notification, confirm_modal.count]);

  const reorderTasks = useCallback((newOrder: string[]) => {
    setTasks_list(prev => {
      const ordered = newOrder.map(id => prev.find(t => t.task_id === id)).filter(Boolean) as Task[];
      const updated = ordered.map((t, i) => ({ ...t, order_index: i }));
      saveToStorage(updated);
      return updated;
    });
  }, [saveToStorage]);

  const toggleSelect = useCallback((id: string, checked: boolean) => {
    setSelected_tasks(prev => checked ? [...prev, id] : prev.filter(i => i !== id));
  }, []);

  const selectAll = useCallback((checked: boolean) => {
    setSelected_tasks(checked ? filtered_tasks.map(t => t.task_id) : []);
  }, [filtered_tasks]);

  const shareTask = useCallback((id: string) => {
    const url = `${window.location.origin}/share/${id}`;
    navigator.clipboard.writeText(url);
    add_notification({ type: 'success', message: 'Guest link copied! Temporary – expires on session end.', duration: 4000 });
  }, [add_notification]);

  const openAddModal = useCallback(() => {
    if (checkGuestLimit()) {
      setModals_state(prev => ({ ...prev, add_modal_open: true, edit_task_id: null }));
      setError(null);
    }
  }, [checkGuestLimit]);

  const closeAddModal = useCallback(() => {
    setModals_state(prev => ({ ...prev, add_modal_open: false, edit_task_id: null }));
    setError(null);
  }, []);

  const handleFormChange = useCallback((field: string, value: any) => {
    setError(null);
    setModals_state(prev => ({
      ...prev,
      form_data: { ...prev.form_data, [field]: value },
    }));
    setError(null); // Clear on change
  }, []);



  const closeLimitModal = useCallback(() => {
    setLimit_modal_open(false);
  }, []);

  // Drag handlers (simple HTML5 drag for rows)
  const [dragged_id, setDragged_id] = useState<string | null>(null);

  const handleDragStart = useCallback((e: React.DragEvent, id: string) => {
    setDragged_id(id);
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, target_id: string) => {
    e.preventDefault();
    if (!dragged_id || dragged_id === target_id) return;
    const fromIndex = tasks_list.findIndex(t => t.task_id === dragged_id);
    const toIndex = tasks_list.findIndex(t => t.task_id === target_id);
    const newOrder = [...tasks_list];
    const [moved] = newOrder.splice(fromIndex, 1);
    newOrder.splice(toIndex, 0, moved);
    reorderTasks(newOrder.map(t => t.task_id));
    setDragged_id(null);
  }, [dragged_id, tasks_list, reorderTasks]);

  // Due today section
  const due_today_tasks = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return filtered_tasks.filter((t) => t.due_date && new Date(t.due_date) >= today && new Date(t.due_date) < new Date(today.getTime() + 86400000));
  }, [filtered_tasks]);

  // Overdue banner
  useEffect(() => {
    if (overdue_tasks.length > 0) {
      add_notification({ type: 'warning', message: `You have ${overdue_tasks.length} overdue task(s)!`, duration: 5000 });
      // Auto-scroll to first overdue (simple)
      const firstOverdue = document.getElementById(`task-${overdue_tasks[0]?.task_id}`);
      firstOverdue?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [overdue_tasks, add_notification]);

  // Empty state
  const is_empty = filtered_tasks.length === 0 && !loading;

  // Submit handler
  const handleSubmit = useCallback(() => {
    if (modals_state.edit_task_id) {
      updateTask();
    } else {
      addTask();
    }
  }, [modals_state.edit_task_id, updateTask, addTask]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Guest Banner */}
      <div className="bg-yellow-100 border-b border-yellow-300 py-4 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between text-yellow-800">
          <p className="text-sm">Guest Mode: Limited to 5 tasks – <Link to="/register" className="font-medium underline hover:text-yellow-900">Sign up for unlimited access!</Link></p>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="bg-white shadow-sm border-b border-gray-200 px-4 sm:px-6 lg:px-8 py-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between text-sm text-gray-600">
          <div className="flex space-x-6">
            <span>{stats.incomplete_count} incomplete tasks</span>
            <span>{stats.due_today_count} due today</span>
            <span>{stats.guest_count}/5 tasks used</span>
          </div>
          {is_offline && <span className="text-red-600">Offline – Guest data is local</span>}
        </div>
      </div>

      {/* Toolbar */}
      <div className="bg-white shadow-sm border-b border-gray-200 px-4 sm:px-6 lg:px-8 py-4">
        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row items-center justify-between space-y-4 lg:space-y-0">
          {/* Search */}
          <div className="flex-1 max-w-md">
            <input
              type="text"
              placeholder="Search tasks..."
              value={filters_state.search}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              aria-label="Search tasks"
            />
          </div>

          {/* Filters and Sort */}
          <div className="flex space-x-4 items-center">
            {/* Status Filter */}
            <select
              value={filters_state.status}
              onChange={(e) => setFilters_state(prev => ({ ...prev, status: e.target.value as any }))}
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All</option>
              <option value="incomplete">Incomplete</option>
              <option value="completed">Completed</option>
            </select>

            {/* Priority Filter */}
            <select
              value={filters_state.priority || ''}
              onChange={(e) => setFilters_state(prev => ({ ...prev, priority: e.target.value as any || null }))}
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Priorities</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>

            {/* Sort */}
            <select
              value={`${sort_state.sort_by}_${sort_state.sort_order}`}
              onChange={(e) => {
                const [by, order] = e.target.value.split('_');
                setSort_state({ sort_by: by as any, sort_order: order as any });
              }}
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="order_index_asc">Sort by Order (Asc)</option>
              <option value="due_date_asc">Due Date (Asc)</option>
              <option value="priority_asc">Priority (Asc)</option>
              <option value="created_at_desc">Created (Desc)</option>
            </select>

            {/* Add Button */}
            <button
              onClick={openAddModal}
              disabled={guest_limit_reached || loading}
              className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Add new task"
            >
              + Add Task
            </button>
          </div>
        </div>
      </div>

      {/* Bulk Toolbar */}
      {selected_tasks.length > 0 && (
        <div className="bg-blue-50 border-b border-blue-200 px-4 py-3">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <span className="text-sm text-blue-800">{selected_tasks.length} selected</span>
            <div className="space-x-2">
              <button onClick={bulkComplete} className="text-blue-700 hover:text-blue-900 text-sm font-medium">Complete</button>
              <button onClick={bulkDelete} className="text-red-700 hover:text-red-900 text-sm font-medium">Delete</button>
              <button onClick={() => setSelected_tasks([])} className="text-gray-500 hover:text-gray-700 text-sm font-medium">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Overdue Banner */}
      {overdue_tasks.length > 0 && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-3">
          <div className="max-w-7xl mx-auto">
            <p className="text-sm text-red-800">You have {overdue_tasks.length} overdue task{overdue_tasks.length > 1 ? 's' : ''}! <button onClick={() => setFilters_state(prev => ({ ...prev, status: 'incomplete' }))} className="underline hover:text-red-900">View them</button></p>
          </div>
        </div>
      )}

      {/* Due Today Section */}
      {due_today_tasks.length > 0 && (
        <div className="bg-blue-50 border-b border-blue-200">
          <div className="px-4 py-3">
            <div className="max-w-7xl mx-auto flex items-center justify-between">
              <h3 className="text-lg font-medium text-blue-900">Due Today ({due_today_tasks.length})</h3>
              <button onClick={() => setFilters_state(prev => ({ ...prev, status: 'incomplete' }))} className="text-blue-700 hover:text-blue-900 text-sm">View All</button>
            </div>
          </div>
          {/* Mini list for due today - similar to main but limited */}
          <div className="overflow-hidden">
            <div className="bg-white divide-y divide-gray-200">
              {due_today_tasks.map((task) => (
                <div key={task.task_id} className={`px-6 py-4 flex items-center space-x-3 hover:bg-gray-50 ${task.status === 'completed' ? 'opacity-50 line-through text-green-600' : ''} ${overdue_tasks.some(o => o.task_id === task.task_id) ? 'bg-red-50' : ''}`}>
                  <input
                    type="checkbox"
                    checked={selected_tasks.includes(task.task_id)}
                    onChange={(e) => toggleSelect(task.task_id, e.target.checked)}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate">{task.title}</p>
                  </div>
                  <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${task.priority === 'high' ? 'bg-red-100 text-red-800' : task.priority === 'medium' ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-800'}`}>
                    {task.priority || 'No priority'}
                  </span>
                  {task.due_date && <span className="ml-2 text-xs text-green-600">Today</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 overflow-hidden">
        <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
          {is_empty ? (
            <div className="text-center py-12">
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
              </svg>
              <h3 className="mt-2 text-sm font-medium text-gray-900">No tasks</h3>
              <p className="mt-1 text-sm text-gray-500">Get started by adding your first task.</p>
              <div className="mt-6">
                <button
                  onClick={openAddModal}
                  disabled={guest_limit_reached}
                  className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400"
                >
                  Add your first task
                </button>
              </div>
            </div>
          ) : (
            <div className="px-4 py-6 sm:px-0">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th scope="col" className="relative px-6 py-3">
                        <input
                          type="checkbox"
                          checked={selected_tasks.length === filtered_tasks.length && filtered_tasks.length > 0}
                          onChange={(e) => selectAll(e.target.checked)}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                        {selected_tasks.length === filtered_tasks.length && filtered_tasks.length > 0 && (
                          <span className="sr-only">Select all</span>
                        )}
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Title</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Due Date</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Priority</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                      <th scope="col" className="relative px-4 py-3">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filtered_tasks.map((task) => {
                      const is_overdue = task.due_date && new Date(task.due_date) < new Date() && task.status === 'incomplete';
                      const is_completed = task.status === 'completed';
                      const rowClass = `hover:bg-gray-50 ${is_overdue ? 'bg-red-50' : ''} ${is_completed ? 'opacity-50 line-through text-green-600' : ''}`;
                      return (
                        <tr key={task.task_id} id={`task-${task.task_id}`} draggable className={rowClass} onDragStart={(e) => handleDragStart(e, task.task_id)} onDragOver={handleDragOver} onDrop={(e) => handleDrop(e, task.task_id)}>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <input
                              type="checkbox"
                              checked={selected_tasks.includes(task.task_id)}
                              onChange={(e) => toggleSelect(task.task_id, e.target.checked)}
                              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                            />
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <div className="h-4 w-4 bg-gray-300 rounded-full flex-shrink-0" aria-hidden="true" /> {/* Drag handle icon */}
                              <div className="ml-4">
                                <div className="text-sm font-medium text-gray-900" onDoubleClick={() => editTask(task.task_id)}>{task.title}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {task.due_date ? new Date(task.due_date).toLocaleDateString() : 'No due date'}
                            {is_overdue && <span className="ml-2 inline-flex px-2 py-1 text-xs font-semibold bg-red-100 text-red-800 rounded-full">Overdue</span>}
                            {!is_overdue && task.due_date && <span className="ml-2 inline-flex px-2 py-1 text-xs font-semibold bg-green-100 text-green-800 rounded-full">Future</span>}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                              task.priority === 'high' ? 'bg-red-100 text-red-800' :
                              task.priority === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {task.priority || 'No priority'}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="inline-flex px-2 py-1 text-xs font-semibold bg-gray-100 text-gray-800 rounded-full">{task.category || 'Uncategorized'}</span>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                            <button onClick={() => toggleStatus(task.task_id)} className="text-blue-600 hover:text-blue-900" aria-label={`Toggle ${task.status}`}>
                              {task.status === 'completed' ? 'Undo' : 'Complete'}
                            </button>
                            <button onClick={() => editTask(task.task_id)} className="text-indigo-600 hover:text-indigo-900">Edit</button>
                            <button onClick={() => duplicateTask(task.task_id)} className="text-purple-600 hover:text-purple-900">Duplicate</button>
                            <button onClick={() => shareTask(task.task_id)} className="text-green-600 hover:text-green-900">Share</button>
                            <button onClick={() => deleteTask(task.task_id)} className="text-red-600 hover:text-red-900">Delete</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Add/Edit Modal */}
      {(modals_state.add_modal_open || modals_state.edit_task_id) && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50" onClick={closeAddModal}>
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-medium text-gray-900 mb-4">{modals_state.edit_task_id ? 'Edit Task' : 'Add New Task'}</h3>
            {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4" role="alert" aria-live="polite">{error}</div>}
            <div className="space-y-4">
              <input
                type="text"
                placeholder="Task title (required)"
                value={modals_state.form_data.title}
                onChange={(e) => handleFormChange('title', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
              <textarea
                placeholder="Description (optional)"
                value={modals_state.form_data.description || ''}
                onChange={(e) => handleFormChange('description', e.target.value || null)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={3}
              />
              <input
                type="date"
                value={modals_state.form_data.due_date ? modals_state.form_data.due_date.toISOString().split('T')[0] : ''}
                onChange={(e) => handleFormChange('due_date', e.target.value ? new Date(e.target.value) : null)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <select
                value={modals_state.form_data.priority || ''}
                onChange={(e) => handleFormChange('priority', e.target.value as any || null)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">No Priority</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
              <input
                type="text"
                placeholder="Category (optional)"
                value={modals_state.form_data.category || ''}
                onChange={(e) => handleFormChange('category', e.target.value || null)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="text"
                placeholder="Tags (comma-separated, optional)"
                value={modals_state.form_data.tags || ''}
                onChange={(e) => handleFormChange('tags', e.target.value || null)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <div className="flex space-x-3 pt-4">
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={loading || !modals_state.form_data.title}
                  className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {loading ? 'Saving...' : (modals_state.edit_task_id ? 'Update' : 'Add')}
                </button>
                <button
                  type="button"
                  onClick={closeAddModal}
                  className="flex-1 bg-gray-300 py-2 px-4 rounded-md hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Limit Reached Modal */}
      {limit_modal_open && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50" onClick={closeLimitModal}>
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-medium text-gray-900 mb-4">Guest Limit Reached</h3>
            <p className="text-sm text-gray-600 mb-4">You've reached the guest limit! Sign up to save more tasks.</p>
            <div className="flex space-x-3">
              <Link to="/register" className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md text-center hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500">
                Sign Up Now
              </Link>
              <button
                onClick={closeLimitModal}
                className="flex-1 bg-gray-300 py-2 px-4 rounded-md hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500"
              >
                Continue as Guest
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Modal */}
      {confirm_modal.open && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50" onClick={() => setConfirm_modal({ open: false, type: 'delete', task_id: undefined, count: 0 })}>
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              {confirm_modal.type === 'delete' ? 'Delete Task?' : `Bulk ${confirm_modal.type === 'bulk' && confirm_modal.count ? `${confirm_modal.count} Tasks` : ''}?`}
            </h3>
            <p className="text-sm text-gray-600 mb-4">This action cannot be undone.</p>
            <div className="flex space-x-3">
              <button
                onClick={confirm_modal.type === 'delete' ? confirmDelete : confirm_modal.type === 'bulk' ? (confirm_modal.count === undefined ? confirmBulkComplete : confirmBulkDelete) : () => {}}
                className="flex-1 bg-red-600 text-white py-2 px-4 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
              >
                Confirm
              </button>
              <button
                onClick={() => setConfirm_modal({ open: false, type: 'delete', task_id: undefined, count: 0 })}
                className="flex-1 bg-gray-300 py-2 px-4 rounded-md hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Offline Banner if applicable */}
      {is_offline && (
        <div className="fixed top-20 left-4 right-4 bg-yellow-100 border border-yellow-300 p-4 rounded-md z-40" role="alert" aria-live="polite">
          <p className="text-sm text-yellow-800">Offline mode – Your guest tasks are saved locally and will sync when online (but guest data is session-only).</p>
        </div>
      )}
    </div>
  );
};

export default UV_GuestDashboard;