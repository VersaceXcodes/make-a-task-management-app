import React, { useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { useAppStore } from '@/store/main';

const UV_ResetPassword: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const resetToken = searchParams.get('token') || 'sim'; // MVP simulation fallback

  const [resetInput, setResetInput] = useState({ password_hash: '', confirm_password: '' });
  const [showPassword1, setShowPassword1] = useState(false);
  const [showPassword2, setShowPassword2] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  // CRITICAL: Individual selectors only
  const isLoading = useAppStore((state) => state.authentication_state.authentication_status.is_loading);
  const isOffline = useAppStore((state) => state.offline_status.is_offline);
  const errorMessage = useAppStore((state) => state.authentication_state.error_message);
  const resetPassword = useAppStore((state) => state.reset_password);
  const addNotification = useAppStore((state) => state.add_notification);
  const clearAuthError = useAppStore((state) => state.clear_auth_error);

  const validatePassword = (password: string): string | null => {
    if (password.length < 8) return 'Password must be at least 8 characters';
    return null;
  };

  const validateConfirm = (confirm: string, password: string): string | null => {
    if (confirm !== password) return 'Passwords do not match';
    return null;
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setResetInput(prev => ({ ...prev, [name]: value }));
    setResetError(null); // Clear errors on change as per rules
  };

  const handleBlur = () => {
    const passError = validatePassword(resetInput.password_hash);
    const confirmError = validateConfirm(resetInput.confirm_password, resetInput.password_hash);
    if (passError) {
      setResetError(passError);
    } else if (confirmError) {
      setResetError(confirmError);
    }
  };

  const handleToggleShow1 = () => setShowPassword1(!showPassword1);
  const handleToggleShow2 = () => setShowPassword2(!showPassword2);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearAuthError();

    const passError = validatePassword(resetInput.password_hash);
    const confirmError = validateConfirm(resetInput.confirm_password, resetInput.password_hash);
    if (passError || confirmError) {
      setResetError(passError || confirmError);
      return;
    }

    if (!resetToken) {
      setResetError('Invalid reset token');
      return;
    }

    setResetLoading(true);
    setResetError(null);

    try {
      await resetPassword(resetToken, resetInput.password_hash);
      addNotification({ type: 'success', message: 'Password reset successfully!', duration: 3000 });
      navigate('/dashboard', { replace: true });
    } catch (error: any) {
      const msg = error.message || 'Reset failed';
      setResetError(msg);
      if (msg.includes('expired') || msg.includes('invalid')) {
        addNotification({ type: 'error', message: 'Link expired – request new', duration: 5000 });
        navigate('/forgot-password', { replace: true });
      } else {
        addNotification({ type: 'error', message: msg, duration: 3000 });
      }
    } finally {
      setResetLoading(false);
    }
  };

  const isFormValid = resetInput.password_hash.length >= 8 && resetInput.confirm_password === resetInput.password_hash && !!resetToken;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <Link
            to="/login"
            className="absolute left-0 top-4 text-gray-500 hover:text-gray-700 text-sm underline flex items-center"
          >
            ← Back to Login
          </Link>
          <h1 className="mt-6 text-center text-3xl font-bold text-gray-900">Reset Your Password</h1>
        </div>

        {isOffline && (
          <div className="bg-yellow-50 border border-yellow-200 text-yellow-700 px-4 py-3 rounded-md" role="alert" aria-live="polite">
            You're offline – changes will sync when back online.
          </div>
        )}

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {resetError && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md" role="alert" aria-live="polite">
              {resetError}
            </div>
          )}

          {errorMessage && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md" role="alert" aria-live="polite">
              {errorMessage}
            </div>
          )}

          <div className="space-y-4">
            <div className="space-y-1">
              <label htmlFor="password_hash" className="block text-sm font-medium text-gray-700 sr-only">
                New password
              </label>
              <div className="relative">
                <input
                  id="password_hash"
                  name="password_hash"
                  type={showPassword1 ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  value={resetInput.password_hash}
                  onChange={handleInputChange}
                  onBlur={handleBlur}
                  placeholder="New password"
                  disabled={resetLoading || isLoading}
                  className={`relative block w-full px-3 py-2 pr-10 border rounded-md placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-colors ${
                    resetInput.password_hash.length >= 8 ? 'border-green-500' : resetInput.password_hash ? 'border-red-500' : 'border-gray-300'
                  } ${resetLoading || isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                  aria-label="New password input"
                />
                <button
                  type="button"
                  onClick={handleToggleShow1}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                  disabled={resetLoading || isLoading}
                >
                  {showPassword1 ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <label htmlFor="confirm_password" className="block text-sm font-medium text-gray-700 sr-only">
                Confirm password
              </label>
              <div className="relative">
                <input
                  id="confirm_password"
                  name="confirm_password"
                  type={showPassword2 ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  value={resetInput.confirm_password}
                  onChange={handleInputChange}
                  onBlur={handleBlur}
                  placeholder="Confirm new password"
                  disabled={resetLoading || isLoading}
                  className={`relative block w-full px-3 py-2 pr-10 border rounded-md placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-colors ${
                    resetInput.confirm_password === resetInput.password_hash && resetInput.password_hash.length >= 8 ? 'border-green-500' : resetInput.confirm_password ? 'border-red-500' : 'border-gray-300'
                  } ${resetLoading || isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                  aria-label="Confirm password input"
                />
                <button
                  type="button"
                  onClick={handleToggleShow2}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                  disabled={resetLoading || isLoading}
                >
                  {showPassword2 ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={!isFormValid || resetLoading || isLoading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {resetLoading || isLoading ? (
                <span className="flex items-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Resetting...
                </span>
              ) : (
                'Reset Password'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default UV_ResetPassword;