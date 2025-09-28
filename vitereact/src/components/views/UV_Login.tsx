import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { useAppStore } from '@/store/main';

// Partial Zod schema for UI validation (plain password, not hash)
const loginValidationSchema = z.object({
  email: z.string().email('Please enter a valid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

const UV_Login: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const emailRef = useRef<HTMLInputElement>(null);

  // Local state
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [isLocked, setIsLocked] = useState(false);

  // Global store selectors (individual, no objects)
  const isAuthenticated = useAppStore((state) => state.authentication_state.authentication_status.is_authenticated);
  const isLoading = useAppStore((state) => state.authentication_state.authentication_status.is_loading);
  const authError = useAppStore((state) => state.authentication_state.error_message);
  const isOffline = useAppStore((state) => state.offline_status.is_offline);
  const loginUserAction = useAppStore((state) => state.login_user);
  const addNotification = useAppStore((state) => state.add_notification);
  const setOffline = useAppStore((state) => state.set_offline);
  const queueOffline = useAppStore((state) => state.queue_offline);
  const syncOffline = useAppStore((state) => state.sync_offline);
  const setGuestMode = useAppStore((state) => state.set_guest_mode);
  const clearAuthError = useAppStore((state) => state.clear_auth_error);

  const redirectTo = searchParams.get('redirect_to') || '/dashboard';

  // Load attempts and lockout from localStorage
  useEffect(() => {
    const storedAttempts = localStorage.getItem('login_attempts');
    const lockoutTime = localStorage.getItem('lockout_time');
    if (storedAttempts) {
      setAttempts(parseInt(storedAttempts, 10));
    }
    if (lockoutTime) {
      const lockTime = new Date(parseInt(lockoutTime, 10)).getTime();
      if (Date.now() < lockTime) {
        setIsLocked(true);
      } else {
        localStorage.removeItem('lockout_time');
        setIsLocked(false);
      }
    }
  }, []);

  // Auto-focus email and pre-fill from URL
  useEffect(() => {
    const urlEmail = searchParams.get('email');
    if (urlEmail) {
      setFormData((prev) => ({ ...prev, email: urlEmail }));
    }
    if (emailRef.current) {
      emailRef.current.focus();
    }

    // Redirect if already authenticated
    if (isAuthenticated) {
      navigate(redirectTo, { replace: true });
    }
  }, [isAuthenticated, searchParams, navigate, redirectTo]);

  // Sync global auth error to local on change
  useEffect(() => {
    if (authError && !loginError) {
      setLoginError('Invalid email/password');
    }
  }, [authError, loginError]);

  // Handle email change with validation
  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setFormData((prev) => ({ ...prev, email: value }));
    setEmailError(null);
    setLoginError(null);
    clearAuthError();

    // Real-time validation
    const result = loginValidationSchema.safeParse({ email: value });
    if (!result.success && value) {
      setEmailError(result.error.errors[0]?.message || 'Please enter a valid email');
    }
  };

  // Handle password change with validation
  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setFormData((prev) => ({ ...prev, password: value }));
    setPasswordError(null);
    setLoginError(null);
    clearAuthError();

    // Real-time validation (min 8)
    if (value.length > 0 && value.length < 8) {
      setPasswordError('Password must be at least 8 characters');
    }
  };

  // Toggle password visibility
  const togglePassword = () => {
    setShowPassword((prev) => !prev);
  };

  // Check if locked and handle submission
  const checkLocked = () => {
    if (isLocked) {
      const lockoutTime = localStorage.getItem('lockout_time');
      if (lockoutTime && Date.now() < parseInt(lockoutTime, 10)) {
        const remaining = Math.ceil((parseInt(lockoutTime, 10) - Date.now()) / 60000);
        addNotification({ type: 'warning', message: `Too many attempts—wait ${remaining} minutes`, duration: 5000 });
        return true;
      } else {
        setIsLocked(false);
        localStorage.removeItem('lockout_time');
      }
    }
    return false;
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading || checkLocked()) return;

    // Final validation
    const validation = loginValidationSchema.safeParse(formData);
    if (!validation.success) {
      validation.error.errors.forEach((err) => {
        if (err.path[0] === 'email') setEmailError(err.message);
        if (err.path[0] === 'password') setPasswordError(err.message);
      });
      if (emailRef.current) emailRef.current.focus();
      return;
    }

    setLoginError(null);
    clearAuthError();

    if (isOffline) {
      queueOffline('login', { email: formData.email, password: formData.password, rememberMe });
      addNotification({ type: 'warning', message: 'You are offline – login queued for reconnect', duration: 5000 });
      return;
    }

    try {
      await loginUserAction(formData.email, formData.password);
      // Success: Reset attempts/lockout
      localStorage.removeItem('login_attempts');
      localStorage.removeItem('lockout_time');
      setAttempts(0);
      setIsLocked(false);
      setLoginError(null);
      addNotification({ type: 'success', message: 'Welcome back!', duration: 3000 });
      navigate(redirectTo, { replace: true });
    } catch (error) {
      // Handle failure
      const newAttempts = attempts + 1;
      setAttempts(newAttempts);
      localStorage.setItem('login_attempts', newAttempts.toString());
      if (newAttempts >= 3) {
        const lockoutTime = Date.now() + 5 * 60 * 1000; // 5 min
        localStorage.setItem('lockout_time', lockoutTime.toString());
        setIsLocked(true);
        addNotification({ type: 'error', message: 'Too many attempts—wait 5 minutes', duration: 5000 });
      }
      setLoginError('Invalid email/password');
      if (emailRef.current) emailRef.current.focus();
    }
  };

  // Handle guest continue
  const handleGuest = () => {
    setGuestMode(true);
    navigate('/guest-dashboard', { replace: true });
  };

  // Handle retry for offline
  const handleRetry = () => {
    if (!isOffline) {
      syncOffline();
      handleSubmit({ preventDefault: () => {} } as React.FormEvent); // Re-trigger submit
    } else {
      addNotification({ type: 'warning', message: 'Still offline – check connection', duration: 3000 });
    }
  };

  // Email valid indicator
  const isEmailValid = formData.email && !emailError && loginValidationSchema.safeParse({ email: formData.email }).success;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8 animate-fade-in transition-opacity duration-300 opacity-100">
      <style>{`
        @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
        .animate-fade-in { animation: fade-in 0.3s ease-out; }
      `}</style>
      <div className="max-w-md w-full space-y-8 bg-white p-8 rounded-lg shadow-md sm:w-3/4 lg:w-1/2 xl:w-1/3">
        {/* Back link */}
        <div className="flex justify-start">
          <Link
            to="/"
            className="text-gray-500 hover:text-gray-700 text-sm font-medium flex items-center"
            aria-label="Back to Home"
          >
            ← Back to Home
          </Link>
        </div>

        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-center text-gray-900" id="login-title">
            Sign In to TaskHub
          </h1>
          <p className="mt-2 text-center text-sm text-gray-600">
            Enter your credentials to access your tasks
          </p>
        </div>

        {/* Offline Banner */}
        {isOffline && (
          <div
            role="alert"
            aria-live="polite"
            className="bg-yellow-50 border border-yellow-200 text-yellow-700 px-4 py-3 rounded-md"
          >
            <p className="text-sm">You are offline – will retry on reconnect</p>
            <button
              onClick={handleRetry}
              className="ml-2 text-yellow-700 underline text-sm hover:no-underline"
              disabled={isLoading}
              aria-label="Retry login"
            >
              Retry
            </button>
          </div>
        )}

        {/* Form */}
        <form className="mt-8 space-y-6" onSubmit={handleSubmit} noValidate>
          {loginError && (
            <div
              role="alert"
              aria-live="polite"
              className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md"
            >
              <p className="text-sm">{loginError}</p>
            </div>
          )}

          {/* Email Input */}
          <div className="space-y-1">
            <label htmlFor="email" className="sr-only">
              Email input
            </label>
            <input
              id="email"
              ref={emailRef}
              type="email"
              autoComplete="email"
              required
              value={formData.email}
              onChange={handleEmailChange}
              placeholder="Enter your email"
              className={`relative block w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-colors ${
                emailError
                  ? 'border-red-500 text-red-900 placeholder-red-300 focus:ring-red-500 focus:border-red-500'
                  : isEmailValid
                  ? 'border-green-500 text-green-900 focus:ring-green-500 focus:border-green-500'
                  : 'border-gray-300 text-gray-900 placeholder-gray-500'
              }`}
              aria-invalid={!!emailError}
              aria-describedby={emailError ? 'email-error' : undefined}
              disabled={isLoading || isLocked}
            />
            {isEmailValid && (
              <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-green-500 text-sm flex items-center">
                ✓
              </span>
            )}
            {emailError && (
              <p id="email-error" className="mt-1 text-sm text-red-600" role="alert">
                {emailError}
              </p>
            )}
          </div>

          {/* Password Input */}
          <div className="space-y-1 relative">
            <label htmlFor="password" className="sr-only">
              Password input
            </label>
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              required
              value={formData.password}
              onChange={handlePasswordChange}
              placeholder="Enter your password"
              className={`block w-full px-3 py-2 pr-10 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-colors ${
                passwordError
                  ? 'border-red-500 text-red-900 placeholder-red-300 focus:ring-red-500 focus:border-red-500'
                  : formData.password.length >= 8 && formData.password.length > 0
                  ? 'border-green-500 text-green-900 focus:ring-green-500 focus:border-green-500'
                  : 'border-gray-300 text-gray-900 placeholder-gray-500'
              }`}
              aria-invalid={!!passwordError}
              aria-describedby={passwordError ? 'password-error' : undefined}
              disabled={isLoading || isLocked}
            />
            <button
              type="button"
              onClick={togglePassword}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-sm leading-5 text-gray-500 hover:text-gray-700"
              disabled={isLoading || isLocked}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
            {formData.password.length > 0 && formData.password.length >= 8 && (
              <span className="absolute right-20 top-1/2 transform -translate-y-1/2 text-green-500 text-sm flex items-center">
                ✓
              </span>
            )}
            {passwordError && (
              <p id="password-error" className="mt-1 text-sm text-red-600" role="alert">
                {passwordError}
              </p>
            )}
          </div>

          {/* Remember Me */}
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <input
                id="remember-me"
                name="remember-me"
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                disabled={isLoading || isLocked}
              />
              <label htmlFor="remember-me" className="ml-2 block text-sm text-gray-900">
                Stay signed in for 30 days
              </label>
            </div>
          </div>

          {/* Submit Button */}
          <div>
            <button
              type="submit"
              disabled={isLoading || isLocked || isOffline}
              className={`group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors ${
                isLoading || isLocked || isOffline
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500'
              }`}
              aria-label="Sign In"
            >
              {isLoading ? (
                <span className="flex items-center">
                  <svg
                    className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  Signing In...
                </span>
              ) : (
                'Sign In'
              )}
            </button>
          </div>

          {/* Links */}
          <div className="text-center space-y-2">
            <Link
              to="/forgot-password"
              className="block w-full text-center text-blue-600 hover:text-blue-500 text-sm font-medium underline"
              aria-label="Forgot Password"
            >
              Forgot Password?
            </Link>
            <button
              type="button"
              onClick={handleGuest}
              className="w-full flex justify-center py-2 px-4 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
              disabled={isLoading}
              aria-label="Continue as Guest"
            >
              Continue as Guest
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default UV_Login;