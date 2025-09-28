import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAppStore } from '@/store/main';

/* Views imports as specified */
import GV_Header from '@/components/views/GV_Header.tsx';
import GV_Footer from '@/components/views/GV_Footer.tsx';
import UV_Homepage from '@/components/views/UV_Homepage.tsx';
import UV_Login from '@/components/views/UV_Login.tsx';
import UV_ForgotPassword from '@/components/views/UV_ForgotPassword.tsx';
import UV_ResetPassword from '@/components/views/UV_ResetPassword.tsx';
import UV_Dashboard from '@/components/views/UV_Dashboard.tsx';
import UV_GuestDashboard from '@/components/views/UV_GuestDashboard.tsx';
import UV_SharedTaskView from '@/components/views/UV_SharedTaskView.tsx';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: 1,
    },
  },
});

// Loading component
const LoadingSpinner: React.FC = () => (
  <div className="min-h-screen flex items-center justify-center bg-gray-50">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
  </div>
);

// ProtectedRoute for authenticated dashboard (not guest)
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Individual selectors to avoid infinite loops
  const isAuthenticated = useAppStore((state) => state.authentication_state.authentication_status.is_authenticated);
  const isGuest = useAppStore((state) => state.authentication_state.is_guest);
  const isLoading = useAppStore((state) => state.authentication_state.authentication_status.is_loading);
  
  if (isLoading) {
    return <LoadingSpinner />;
  }
  
  if (isGuest) {
    return <Navigate to="/guest-dashboard" replace />;
  }
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  
  return <>{children}</>;
};

const App: React.FC = () => {
  // Individual selectors
  const isLoading = useAppStore((state) => state.authentication_state.authentication_status.is_loading);
  const initializeAuth = useAppStore((state) => state.initialize_auth);
  
  useEffect(() => {
    // Initialize auth state when app loads
    initializeAuth();
  }, [initializeAuth]);
  
  if (isLoading) {
    return <LoadingSpinner />;
  }
  
  return (
    <Router>
      <QueryClientProvider client={queryClient}>
        <div className="min-h-screen flex flex-col bg-gray-50">
          <GV_Header />
          <main className="flex-1 flex flex-col">
            <Routes>
              {/* Root route with conditional redirect based on auth/guest */}
              <Route
                path="/"
                element={
                  (() => {
                    // Inline component for conditional logic
                    const isAuthenticated = useAppStore((state) => state.authentication_state.authentication_status.is_authenticated);
                    const isGuest = useAppStore((state) => state.authentication_state.is_guest);
                    if (isAuthenticated) {
                      return <Navigate to="/dashboard" replace />;
                    }
                    if (isGuest) {
                      return <Navigate to="/guest-dashboard" replace />;
                    }
                    return <UV_Homepage />;
                  })()
                }
              />
              
              {/* Public auth routes */}
              <Route path="/login" element={<UV_Login />} />
              <Route path="/forgot-password" element={<UV_ForgotPassword />} />
              <Route path="/reset-password" element={<UV_ResetPassword />} />
              
              {/* Public guest dashboard */}
              <Route path="/guest-dashboard" element={<UV_GuestDashboard />} />
              
              {/* Protected dashboard */}
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute>
                    <UV_Dashboard />
                  </ProtectedRoute>
                }
              />
              
              {/* Public shared task view */}
              <Route path="/share/:taskId" element={<UV_SharedTaskView />} />
              
              {/* Catch-all redirect to home */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
          <GV_Footer />
        </div>
      </QueryClientProvider>
    </Router>
  );
};

export default App;