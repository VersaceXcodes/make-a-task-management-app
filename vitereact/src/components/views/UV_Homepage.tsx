import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAppStore } from '@/store/main';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheckCircle, faEye, faEyeSlash, faPlus, faSort, faCheck, faShare, faExclamationTriangle } from '@fortawesome/free-solid-svg-icons';

const UV_Homepage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const emailRef = useRef<HTMLInputElement>(null);

  // Local states
  const [userInput, setUserInput] = useState({ email: '', password: '', confirmPassword: '', name: '' });
  const [guestFlag, setGuestFlag] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formMode, setFormMode] = useState<'register' | 'login'>('register');
  const [showPassword, setShowPassword] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [confirmError, setConfirmError] = useState('');
  const [nameError, setNameError] = useState('');
  const [loginFailCount, setLoginFailCount] = useState(0);
  const [isLocked, setIsLocked] = useState(false);
  const [lockoutTime, setLockoutTime] = useState<Date | null>(null);

  // Global store selectors (individual only)
  const authenticationStatus = useAppStore((state) => state.authentication_state.authentication_status);
  const isGuest = useAppStore((state) => state.authentication_state.is_guest);
  const offlineStatus = useAppStore((state) => state.offline_status.is_offline);
  const addNotification = useAppStore((state) => state.add_notification);
  const registerUser = useAppStore((state) => state.register_user);
  const loginUser = useAppStore((state) => state.login_user);
  const setGuestMode = useAppStore((state) => state.set_guest_mode);
  const queueOffline = useAppStore((state) => state.queue_offline);
  const setOffline = useAppStore((state) => state.set_offline);
  const clearAuthError = useAppStore((state) => state.clear_auth_error);

  // Prefill email from URL
  useEffect(() => {
    const emailParam = searchParams.get('email');
    if (emailParam) {
      const sanitizedEmail = emailParam.replace(/[^a-zA-Z0-9@._-]/g, ''); // Sanitize
      setUserInput(prev => ({ ...prev, email: sanitizedEmail }));
    }
    // Auto-focus
    emailRef.current?.focus();
  }, [searchParams]);

  // Offline handling
  useEffect(() => {
    const handleOnline = () => {
      setOffline(false);
      // Sync if queued (forms)
    };
    const handleOffline = () => {
      setOffline(true);
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [setOffline]);

  // Lockout timer
  useEffect(() => {
    if (isLocked && lockoutTime) {
      const timeout = setTimeout(() => {
        setIsLocked(false);
        setLoginFailCount(0);
      }, 5 * 60 * 1000); // 5 min
      return () => clearTimeout(timeout);
    }
  }, [isLocked, lockoutTime]);

  // Real-time validation
  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    setEmailError(email && !emailRegex.test(email) ? 'Invalid email format' : '');
  };

  const validatePassword = (password: string) => {
    setPasswordError(password.length < 8 ? 'Password too short (min 8 characters)' : '');
  };

  const validateConfirm = (confirm: string, password: string) => {
    setConfirmError(formMode === 'register' && confirm && confirm !== password ? 'Passwords do not match' : '');
  };

  const validateName = (name: string) => {
    setNameError(name && (name.length < 1 || name.length > 100) ? 'Name must be 1-100 characters' : '');
  };

  const handleInputChange = (field: string, value: string) => {
    setUserInput(prev => ({ ...prev, [field]: value }));
    setFormError(null); // Clear errors on change
    switch (field) {
      case 'email': validateEmail(value); break;
      case 'password': validatePassword(value); validateConfirm(userInput.confirmPassword, value); break;
      case 'confirmPassword': validateConfirm(value, userInput.password); break;
      case 'name': validateName(value); break;
    }
  };

  const togglePasswordVisibility = () => setShowPassword(!showPassword);

  const toggleFormMode = () => {
    setFormMode(prev => prev === 'register' ? 'login' : 'register');
    setUserInput({ email: '', password: '', confirmPassword: '', name: '' });
    setFormError(null);
    setEmailError(''); setPasswordError(''); setConfirmError(''); setNameError('');
    clearAuthError();
  };

  const expandForm = () => {
    setFormOpen(true);
    // Smooth scroll if needed, but since embedded, just open
  };

  const handleGuest = () => {
    setGuestMode(true);
    setGuestFlag(true);
    navigate('/guest-dashboard');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formLoading) return;

    // Clear errors
    setFormError(null);
    setEmailError(''); setPasswordError(''); setConfirmError(''); setNameError('');

    // Validate
    validateEmail(userInput.email);
    validatePassword(userInput.password);
    if (formMode === 'register') {
      validateConfirm(userInput.confirmPassword, userInput.password);
      validateName(userInput.name);
    }
    if (emailError || passwordError || (formMode === 'register' && (confirmError || nameError))) {
      setFormError('Please fix errors above');
      return;
    }

    // Lockout for login
    if (formMode === 'login' && isLocked) {
      addNotification({ type: 'error', message: 'Too many attempts—wait 5 minutes', duration: 5000 });
      return;
    }

    setFormLoading(true);
    try {
      if (offlineStatus) {
        // Queue
        queueOffline(formMode === 'register' ? 'register' : 'login', userInput);
        addNotification({ type: 'warning', message: 'Offline: Form queued, will sync when online', duration: 3000 });
        return;
      }

      if (formMode === 'register') {
        await registerUser(userInput.email, userInput.password, userInput.name || undefined);
        addNotification({ type: 'success', message: 'Account created! Welcome to TaskHub.', duration: 3000 });
        // Redirect handled by store + App route
      } else {
        await loginUser(userInput.email, userInput.password);
        // Remember Me: Store persists token, no extra
        addNotification({ type: 'success', message: 'Logged in successfully!', duration: 3000 });
      }
    } catch (error: any) {
      const msg = error.message || (formMode === 'register' ? 'Registration failed' : 'Invalid email/password');
      setFormError(msg);
      addNotification({ type: 'error', message: msg, duration: 5000 });
      if (formMode === 'login') {
        setLoginFailCount(prev => prev + 1);
        if (loginFailCount + 1 >= 3) {
          setIsLocked(true);
          setLockoutTime(new Date());
          addNotification({ type: 'error', message: 'Too many attempts—wait 5 minutes', duration: 5000 });
        }
      }
    } finally {
      setFormLoading(false);
    }
  };

  const handleForgotPassword = () => {
    navigate('/forgot-password');
  };

  // Initial guest sync
  useEffect(() => {
    setGuestFlag(isGuest);
  }, [isGuest]);

  // Fade-in animation
  const [fadeIn, setFadeIn] = useState(false);
  useEffect(() => {
    setFadeIn(true);
  }, []);

  if (authenticationStatus.is_loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-gray-50 flex flex-col transition-opacity duration-500 ${fadeIn ? 'opacity-100' : 'opacity-0'}`}>
      {/* Offline Banner */}
      {offlineStatus && (
        <div className="bg-yellow-100 border-b border-yellow-400 text-yellow-700 px-4 py-3 w-full" role="alert" aria-live="polite">
          <div className="flex items-center justify-between">
            <span className="text-sm">You're offline – changes will sync later</span>
            <button
              onClick={() => window.location.reload()}
              className="ml-4 bg-yellow-500 text-white px-3 py-1 rounded text-sm hover:bg-yellow-600"
              aria-label="Retry connection"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Guest Banner */}
      {guestFlag && (
        <div className="bg-yellow-200 border-b border-yellow-300 text-yellow-800 px-4 py-3 w-full">
          <div className="flex items-center justify-between">
            <span className="text-sm">Guest Mode: Limited to 5 tasks – <button onClick={expandForm} className="underline hover:text-yellow-900">Sign up for unlimited!</button></span>
            <FontAwesomeIcon icon={faExclamationTriangle} className="text-yellow-600" aria-hidden="true" />
          </div>
        </div>
      )}

      {/* Hero Section */}
      <section className="flex-1 flex flex-col items-center justify-center px-4 py-12 sm:py-16 lg:py-20 text-center">
        <div className="max-w-4xl mx-auto">
          {/* Illustration */}
          <div className="mx-auto w-48 h-48 mb-8 flex items-center justify-center bg-blue-50 rounded-full" role="img" aria-label="Task list illustration">
            <svg viewBox="0 0 100 100" className="w-24 h-24 text-blue-600">
              <rect x="20" y="20" width="60" height="10" fill="currentColor" />
              <rect x="20" y="40" width="60" height="10" fill="currentColor" />
              <circle cx="50" cy="70" r="15" fill="currentColor" />
              <rect x="30" y="85" width="40" height="5" fill="currentColor" />
            </svg>
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 mb-4">Manage Your Tasks Simply</h1>
          <p className="text-lg sm:text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
            Create, organize, track, and share tasks efficiently. Stay productive without overwhelming complexity – perfect for individuals and small teams.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={expandForm}
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-8 rounded-md text-lg w-full sm:w-auto transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              aria-label="Get Started with registration"
            >
              Get Started
            </button>
            <button
              onClick={handleGuest}
              className="border-2 border-gray-300 hover:border-gray-400 text-gray-700 font-medium py-3 px-8 rounded-md text-lg w-full sm:w-auto transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
              aria-label="Try as Guest"
            >
              Try as Guest
            </button>
          </div>
        </div>
      </section>

      {/* Features Teaser */}
      <section className="bg-white py-12 px-4">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-gray-900 text-center mb-8">Why Choose TaskHub?</h2>
          <ul className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
            <li className="flex items-start space-x-3">
              <FontAwesomeIcon icon={faPlus} className="text-blue-600 mt-1 flex-shrink-0" aria-hidden="true" />
              <span className="text-gray-700">Quick add tasks in seconds</span>
            </li>
            <li className="flex items-start space-x-3">
              <FontAwesomeIcon icon={faSort} className="text-blue-600 mt-1 flex-shrink-0" aria-hidden="true" />
              <span className="text-gray-700">Sort by due date and priority</span>
            </li>
            <li className="flex items-start space-x-3">
              <FontAwesomeIcon icon={faCheck} className="text-green-600 mt-1 flex-shrink-0" aria-hidden="true" />
              <span className="text-gray-700">Mark complete easily with bulk actions</span>
            </li>
            <li className="flex items-start space-x-3">
              <FontAwesomeIcon icon={faShare} className="text-blue-600 mt-1 flex-shrink-0" aria-hidden="true" />
              <span className="text-gray-700">Share view-only links for collaboration</span>
            </li>
          </ul>
        </div>
      </section>

      {/* Embedded Forms - Collapsible */}
      <section className={`bg-gray-50 py-12 px-4 transition-all duration-300 overflow-hidden ${formOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}>
        <div className="max-w-md mx-auto">
          <div className="bg-white rounded-lg shadow-md p-6">
            {/* Form Errors */}
            {formError && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md mb-4" role="alert" aria-live="polite">
                {formError}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Toggle Mode */}
              <div className="text-center mb-4">
                <button
                  type="button"
                  onClick={toggleFormMode}
                  className="text-blue-600 hover:text-blue-500 text-sm font-medium underline"
                >
                  {formMode === 'register' ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
                </button>
              </div>

              {/* Name - Register only */}
              {formMode === 'register' && (
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">Full Name (Optional)</label>
                  <input
                    id="name"
                    type="text"
                    value={userInput.name}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                    onBlur={(e) => validateName(e.target.value)}
                    className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${nameError ? 'border-red-500' : 'border-gray-300'}`}
                    placeholder="Your name"
                    aria-label="Full name input"
                    disabled={formLoading}
                  />
                  {nameError && <p className="text-red-500 text-xs mt-1">{nameError}</p>}
                </div>
              )}

              {/* Email */}
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  ref={emailRef}
                  id="email"
                  type="email"
                  value={userInput.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  onBlur={(e) => validateEmail(e.target.value)}
                  className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${emailError ? 'border-red-500' : userInput.email && !emailError ? 'border-green-500' : 'border-gray-300'}`}
                  placeholder="Enter your email"
                  aria-label="Email input field"
                  required
                  disabled={formLoading || (formMode === 'login' && isLocked)}
                  autoComplete="email"
                />
                {userInput.email && !emailError && <FontAwesomeIcon icon={faCheckCircle} className="text-green-500 absolute right-3 top-1/2 transform -translate-y-1/2 text-sm" aria-hidden="true" />}
                {emailError && <p className="text-red-500 text-xs mt-1">{emailError}</p>}
              </div>

              {/* Password */}
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={userInput.password}
                    onChange={(e) => handleInputChange('password', e.target.value)}
                    onBlur={(e) => validatePassword(e.target.value)}
                    className={`w-full pr-10 pl-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${passwordError ? 'border-red-500' : 'border-gray-300'}`}
                    placeholder="Enter your password"
                    aria-label="Password input field"
                    required
                    disabled={formLoading || (formMode === 'login' && isLocked)}
                    autoComplete={formMode === 'register' ? 'new-password' : 'current-password'}
                  />
                  <button
                    type="button"
                    onClick={togglePasswordVisibility}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    <FontAwesomeIcon icon={showPassword ? faEyeSlash : faEye} />
                  </button>
                </div>
                {passwordError && <p className="text-red-500 text-xs mt-1">{passwordError}</p>}
              </div>

              {/* Confirm Password - Register only */}
              {formMode === 'register' && (
                <div>
                  <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
                  <input
                    id="confirmPassword"
                    type={showPassword ? 'text' : 'password'}
                    value={userInput.confirmPassword}
                    onChange={(e) => handleInputChange('confirmPassword', e.target.value)}
                    onBlur={(e) => validateConfirm(e.target.value, userInput.password)}
                    className={`w-full pr-10 pl-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${confirmError ? 'border-red-500' : 'border-gray-300'}`}
                    placeholder="Confirm your password"
                    aria-label="Confirm password input field"
                    required
                    disabled={formLoading}
                    autoComplete="new-password"
                  />
                  {confirmError && <p className="text-red-500 text-xs mt-1">{confirmError}</p>}
                </div>
              )}

              {/* Remember Me - Login only */}
              {formMode === 'login' && (
                <div className="flex items-center">
                  <input
                    id="remember"
                    type="checkbox"
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    disabled={formLoading || isLocked}
                  />
                  <label htmlFor="remember" className="ml-2 block text-sm text-gray-900">Remember me</label>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={formLoading || (formMode === 'login' && isLocked) || !userInput.email || !userInput.password}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium py-3 px-4 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed flex items-center justify-center"
                aria-label={formMode === 'register' ? 'Create account' : 'Sign in'}
              >
                {formLoading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    {formMode === 'register' ? 'Creating...' : 'Signing in...'}
                  </>
                ) : (
                  formMode === 'register' ? 'Create Account' : 'Sign In'
                )}
              </button>

              {/* Secondary Buttons */}
              <div className="flex flex-col space-y-2 pt-2">
                {formMode === 'login' && (
                  <>
                    <Link
                      to="/forgot-password"
                      className="text-center text-blue-600 hover:text-blue-500 text-sm font-medium underline"
                      onClick={clearAuthError}
                    >
                      Forgot Password?
                    </Link>
                    <button
                      type="button"
                      onClick={handleGuest}
                      disabled={formLoading}
                      className="w-full border border-gray-300 hover:border-gray-400 text-gray-700 font-medium py-2 px-4 rounded-md text-sm transition-colors disabled:cursor-not-allowed"
                    >
                      Continue as Guest
                    </button>
                  </>
                )}
              </div>
            </form>
          </div>
        </div>
      </section>
    </div>
  );
};

export default UV_Homepage;