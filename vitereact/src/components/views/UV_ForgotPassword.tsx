import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAppStore } from '@/store/main';

const UV_ForgotPassword: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const emailRef = useRef<HTMLInputElement>(null);

  // Local state for form (per datamap + validation)
  const [emailInput, setEmailInput] = useState({ email: '' });
  const [touched, setTouched] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Global state selectors (CRITICAL: individual, no objects)
  const isAuthenticated = useAppStore((state) => state.authentication_state.authentication_status.is_authenticated);
  const isOffline = useAppStore((state) => state.offline_status.is_offline);
  const isLoading = useAppStore((state) => state.global_notifications.is_loading);
  const requestPasswordReset = useAppStore((state) => state.request_password_reset);
  const queueOffline = useAppStore((state) => state.queue_offline);
  const addNotification = useAppStore((state) => state.add_notification);

  // Email validation regex (aligns with Zod email format)
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const isValidEmail = (email: string) => emailRegex.test(email);

  // Prefill from URL param ?email (sanitized: trim, validate)
  useEffect(() => {
    const paramEmail = searchParams.get('email');
    if (paramEmail) {
      const trimmed = paramEmail.trim();
      if (trimmed && isValidEmail(trimmed)) {
        setEmailInput({ email: trimmed });
        setValidationError(null);
      }
    }
  }, [searchParams]);

  // Redirect if authenticated (guard for unauth only)
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  // Auto-focus email input on mount
  useEffect(() => {
    emailRef.current?.focus();
  }, []);

  // Handle email change (clear error, update, validate if touched)
  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setEmailInput((prev) => ({ ...prev, email: value }));
    setValidationError(null); // Clear on change (CRITICAL RULE)
    if (touched && value && !isValidEmail(value)) {
      setValidationError('Please enter a valid email');
    }
  };

  // Handle blur (set touched, validate)
  const handleBlur = () => {
    setTouched(true);
    const email = emailInput.email;
    if (!email) {
      setValidationError('Please enter a valid email');
    } else if (!isValidEmail(email)) {
      setValidationError('Please enter a valid email');
    }
  };

  // Is form valid (for button disable + green check)
  const isFormValid = touched && emailInput.email && isValidEmail(emailInput.email) && !validationError && !isLoading;

  // Handle form submit (request_reset action)
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const email = emailInput.email.trim();
    setTouched(true); // Ensure validation

    // Final local validation (Zod-like, prevent invalid API call)
    if (!email) {
      setValidationError('Please enter a valid email');
      return;
    }
    if (!isValidEmail(email)) {
      setValidationError('Please enter a valid email');
      return;
    }
    setValidationError(null);

    if (isOffline) {
      // Offline: Queue action (per details: queue with sync toast)
      queueOffline('request_password_reset', { email });
      addNotification({
        type: 'warning',
        message: 'Offline – request queued for sync when connected',
        duration: 5000,
      });
      // Stay on page for retry (no nav; user can retry when online)
      return;
    }

    // Online: Call store action (delegated, no direct API)
    try {
      await requestPasswordReset(email);
      // On success (store adds green toast), navigate back (closes flow)
      navigate('/login', { replace: true });
    } catch (error) {
      // Store catches + adds error toast (vague for privacy/404); no additional handling
      console.error('Reset request error:', error);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        {/* Back Link */}
        <div className="flex justify-start">
          <Link
            to="/login"
            className="group inline-flex items-center text-sm font-medium text-gray-600 hover:text-gray-900"
            aria-label="Back to login page"
          >
            <span className="mr-1">&larr;</span>
            Back to Login
          </Link>
        </div>

        {/* Header */}
        <div>
          <h1 id="forgot-title" className="text-center text-3xl font-bold text-gray-900">
            Forgot Your Password?
          </h1>
        </div>

        {/* Form */}
        <form className="mt-8 space-y-6" onSubmit={handleSubmit} role="form" aria-labelledby="forgot-title">
          {/* Error Banner (inline, high contrast red) */}
          {validationError && (
            <div
              id="email-error"
              className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm"
              role="alert"
              aria-live="polite"
            >
              {validationError}
            </div>
          )}

          {/* Offline Banner (yellow if offline and queued) */}
          {isOffline && (
            <div className="bg-yellow-50 border border-yellow-200 text-yellow-700 px-4 py-3 rounded-md text-sm">
              You are offline. Requests will sync when connected.
            </div>
          )}

          {/* Email Input */}
          <div className="space-y-1 relative">
            <label htmlFor="email" className="sr-only">
              Email for password reset
            </label>
            <input
              ref={emailRef}
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={emailInput.email}
              onChange={handleEmailChange}
              onBlur={handleBlur}
              placeholder="Enter your email"
              className={`relative block w-full px-3 py-2 border rounded-md placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-colors ${
                touched && validationError
                  ? 'border-red-300 pr-10'
                  : touched && isFormValid
                  ? 'border-green-300 pr-10'
                  : 'border-gray-300'
              }`}
              aria-describedby={validationError ? 'email-error' : undefined}
              aria-invalid={!!validationError}
            />
            {/* Green Checkmark (text-based, no external icons) */}
            {touched && isFormValid && (
              <span className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-green-500">
                ✓
              </span>
            )}
          </div>

          {/* Submit Button */}
          <div>
            <button
              type="submit"
              disabled={!emailInput.email || !!validationError || isLoading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              aria-busy={isLoading}
              aria-label={isLoading ? 'Sending reset link' : 'Send reset link'}
            >
              {isLoading ? (
                <span className="flex items-center">
                  <svg
                    className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Sending...
                </span>
              ) : (
                'Send Reset Link'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default UV_ForgotPassword;