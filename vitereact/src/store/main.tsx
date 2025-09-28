import { create } from 'zustand';
import { persist, PersistOptions } from 'zustand/middleware';
import axios from 'axios';

const API_BASE = `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'}/api`;

// Types from OpenAPI/BRD
export interface User {
  user_id: string;
  email: string;
  name: string | null;
  predefined_categories: string[];
  created_at: string;
}

export interface Notification {
  id?: string;
  type: 'success' | 'error' | 'warning';
  message: string;
  duration?: number;
}

interface AuthenticationState {
  current_user: User | null;
  auth_token: string | null;
  is_guest: boolean;
  authentication_status: {
    is_authenticated: boolean;
    is_loading: boolean;
  };
  error_message: string | null;
}

interface OfflineStatus {
  is_offline: boolean;
  queued_actions: Array<{ action: string; payload: any; timestamp: string }> | null;
}

interface GlobalSearchQuery {
  search_query: string;
  search_results: any[] | null;
}

interface GlobalNotifications {
  notifications: Notification[];
  is_loading: boolean;
}

interface AppState {
  // States
  authentication_state: AuthenticationState;
  offline_status: OfflineStatus;
  global_search_query: GlobalSearchQuery;
  global_notifications: GlobalNotifications;

  // Auth Actions
  initialize_auth: () => Promise<void>;
  login_user: (email: string, password: string) => Promise<void>;
  register_user: (email: string, password: string, name?: string) => Promise<void>;
  logout_user: () => Promise<void>;
  request_password_reset: (email: string) => Promise<void>;
  reset_password: (reset_token: string, password: string) => Promise<void>;
  update_user_profile: (partialUser: Partial<User>) => void;
  clear_auth_error: () => void;
  set_guest_mode: (flag: boolean) => void;

  // Offline Actions
  set_offline: (status: boolean) => void;
  queue_offline: (action: string, payload: any) => void;
  sync_offline: () => void;

  // Search Actions
  update_global_search: (query: string, results?: any[]) => void;

  // Notification Actions
  add_notification: (notification: Omit<Notification, 'id'>) => void;
  clear_notifications: () => void;
  remove_notification: (id: string) => void;
}

// Create store with persist
const useAppStoreBase = create<AppState>((set, get) => ({
  // Initial states
  authentication_state: {
    current_user: null,
    auth_token: null,
    is_guest: false,
    authentication_status: {
      is_authenticated: false,
      is_loading: true, // Start loading for init check
    },
    error_message: null,
  },
  offline_status: {
    is_offline: false,
    queued_actions: null,
  },
  global_search_query: {
    search_query: '',
    search_results: null,
  },
  global_notifications: {
    notifications: [],
    is_loading: false,
  },

  // Auth Actions
  initialize_auth: async () => {
    const { authentication_state } = get();
    const { auth_token } = authentication_state;

    set((state) => ({
      authentication_state: {
        ...state.authentication_state,
        authentication_status: {
          ...state.authentication_state.authentication_status,
          is_loading: !auth_token, // Loading only if no token to check
        },
      },
    }));

    if (!auth_token) {
      set((state) => ({
        authentication_state: {
          ...state.authentication_state,
          authentication_status: {
            ...state.authentication_state.authentication_status,
            is_loading: false,
          },
        },
      }));
      return;
    }

    try {
      const response = await axios.get(`${API_BASE}/users/me`, {
        headers: { Authorization: `Bearer ${auth_token}` },
      });

      set((state) => ({
        authentication_state: {
          ...state.authentication_state,
          current_user: response.data,
          auth_token,
          authentication_status: {
            is_authenticated: true,
            is_loading: false,
          },
          error_message: null,
        },
      }));
    } catch (error) {
      // Invalid token, clear
      set((state) => ({
        authentication_state: {
          ...state.authentication_state,
          current_user: null,
          auth_token: null,
          is_authenticated: false,
          authentication_status: {
            is_authenticated: false,
            is_loading: false,
          },
          error_message: null,
        },
      }));
    }
  },

  login_user: async (email: string, password: string) => {
    set((state) => ({
      authentication_state: {
        ...state.authentication_state,
        authentication_status: {
          ...state.authentication_state.authentication_status,
          is_loading: true,
        },
        error_message: null,
      },
    }));

    try {
      const response = await axios.post(`${API_BASE}/auth/login`, { email, password });

      const { user, token } = response.data;

      set((state) => ({
        authentication_state: {
          current_user: user,
          auth_token: token,
          is_guest: false,
          authentication_status: {
            is_authenticated: true,
            is_loading: false,
          },
          error_message: null,
        },
      }));
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'Login failed';
      set((state) => ({
        authentication_state: {
          ...state.authentication_state,
          current_user: null,
          auth_token: null,
          authentication_status: {
            is_authenticated: false,
            is_loading: false,
          },
          error_message: errorMessage,
        },
      }));
      throw new Error(errorMessage);
    }
  },

  register_user: async (email: string, password: string, name?: string) => {
    set((state) => ({
      authentication_state: {
        ...state.authentication_state,
        authentication_status: {
          ...state.authentication_state.authentication_status,
          is_loading: true,
        },
        error_message: null,
      },
    }));

    try {
      const body = { email, password };
      if (name) body.name = name;

      const response = await axios.post(`${API_BASE}/auth/register`, body);

      const { user, token } = response.data;

      set((state) => ({
        authentication_state: {
          current_user: user,
          auth_token: token,
          is_guest: false,
          authentication_status: {
            is_authenticated: true,
            is_loading: false,
          },
          error_message: null,
        },
      }));
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'Registration failed';
      set((state) => ({
        authentication_state: {
          ...state.authentication_state,
          authentication_status: {
            is_authenticated: false,
            is_loading: false,
          },
          error_message: errorMessage,
        },
      }));
      throw new Error(errorMessage);
    }
  },

  logout_user: async () => {
    const { auth_token } = get().authentication_state;

    if (auth_token) {
      try {
        await axios.post(
          `${API_BASE}/auth/logout`,
          {},
          { headers: { Authorization: `Bearer ${auth_token}` } }
        );
      } catch (error) {
        // Ignore logout errors, just clear client-side
      }
    }

    set((state) => ({
      authentication_state: {
        ...state.authentication_state,
        current_user: null,
        auth_token: null,
        is_guest: false,
        authentication_status: {
          is_authenticated: false,
          is_loading: false,
        },
        error_message: null,
      },
      offline_status: {
        ...state.offline_status,
        queued_actions: null, // Clear queue on logout
      },
    }));
  },

  request_password_reset: async (email: string) => {
    set((state) => ({
      global_notifications: {
        ...state.global_notifications,
        is_loading: true,
      },
    }));

    try {
      await axios.post(`${API_BASE}/auth/forgot-password`, { email });

      get().add_notification({
        type: 'success',
        message: 'Reset link sent (simulated)',
        duration: 5000,
      });
    } catch (error: any) {
      get().add_notification({
        type: 'error',
        message: 'Reset request failed',
        duration: 5000,
      });
    } finally {
      set((state) => ({
        global_notifications: {
          ...state.global_notifications,
          is_loading: false,
        },
      }));
    }
  },

  reset_password: async (reset_token: string, password: string) => {
    set((state) => ({
      authentication_state: {
        ...state.authentication_state,
        authentication_status: {
          ...state.authentication_state.authentication_status,
          is_loading: true,
        },
        error_message: null,
      },
    }));

    try {
      const response = await axios.post(`${API_BASE}/auth/reset-password`, {
        reset_token,
        password,
      });

      const { user, token } = response.data;

      set((state) => ({
        authentication_state: {
          current_user: user,
          auth_token: token,
          is_guest: false,
          authentication_status: {
            is_authenticated: true,
            is_loading: false,
          },
          error_message: null,
        },
      }));
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'Reset failed';
      set((state) => ({
        authentication_state: {
          ...state.authentication_state,
          authentication_status: {
            is_authenticated: false,
            is_loading: false,
          },
          error_message: errorMessage,
        },
      }));
      throw new Error(errorMessage);
    }
  },

  update_user_profile: (partialUser: Partial<User>) => {
    set((state) => ({
      authentication_state: {
        ...state.authentication_state,
        current_user: state.authentication_state.current_user
          ? { ...state.authentication_state.current_user, ...partialUser }
          : null,
      },
    }));
  },

  clear_auth_error: () => {
    set((state) => ({
      authentication_state: {
        ...state.authentication_state,
        error_message: null,
      },
    }));
  },

  set_guest_mode: (flag: boolean) => {
    set((state) => ({
      authentication_state: {
        ...state.authentication_state,
        is_guest: flag,
      },
      offline_status: {
        ...state.offline_status,
        queued_actions: flag ? null : state.offline_status.queued_actions, // Clear queue for guest
      },
    }));
  },

  // Offline Actions
  set_offline: (status: boolean) => {
    set((state) => ({
      offline_status: {
        ...state.offline_status,
        is_offline: status,
      },
    }));
  },

  queue_offline: (action: string, payload: any) => {
    set((state) => ({
      offline_status: {
        ...state.offline_status,
        queued_actions: state.offline_status.queued_actions
          ? [...state.offline_status.queued_actions, { action, payload, timestamp: new Date().toISOString() }]
          : [{ action, payload, timestamp: new Date().toISOString() }],
      },
    }));
  },

  sync_offline: () => {
    const { queued_actions } = get().offline_status;
    if (!queued_actions || queued_actions.length === 0) return;

    // Placeholder: Process queue optimistically (views handle actual API retries)
    set((state) => ({
      offline_status: {
        ...state.offline_status,
        queued_actions: null,
      },
    }));

    get().add_notification({
      type: 'success',
      message: 'Offline actions synced',
      duration: 3000,
    });
  },

  // Search Actions
  update_global_search: (query: string, results?: any[]) => {
    set((state) => ({
      global_search_query: {
        search_query: query,
        search_results: results || null,
      },
    }));
  },

  // Notification Actions
  add_notification: (notification: Omit<Notification, 'id'>) => {
    const id = Date.now().toString();
    set((state) => ({
      global_notifications: {
        ...state.global_notifications,
        notifications: [
          ...state.global_notifications.notifications,
          { ...notification, id },
        ],
      },
    }));

    if (notification.duration) {
      setTimeout(() => get().remove_notification(id), notification.duration);
    }
  },

  clear_notifications: () => {
    set((state) => ({
      global_notifications: {
        ...state.global_notifications,
        notifications: [],
      },
    }));
  },

  remove_notification: (id: string) => {
    set((state) => ({
      global_notifications: {
        ...state.global_notifications,
        notifications: state.global_notifications.notifications.filter((n) => n.id !== id),
      },
    }));
  },
}));

// Persist config: Only auth essentials
const persistOptions: PersistOptions<AppState> = {
  name: 'taskhub-app-storage',
  partialize: (state) => ({
    authentication_state: {
      current_user: state.authentication_state.current_user,
      auth_token: state.authentication_state.auth_token,
      is_guest: false, // Reset guest on load (session-only)
      authentication_status: {
        is_authenticated: state.authentication_state.authentication_status.is_authenticated,
        is_loading: false, // Never persist loading
      },
      error_message: null, // Never persist errors
    },
    // No other states persisted
  }),
};

// Export persisted store
export const useAppStore = create<AppState>()(
  persist(useAppStoreBase, persistOptions)
);