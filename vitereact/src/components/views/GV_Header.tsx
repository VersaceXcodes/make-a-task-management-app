import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAppStore } from '@/store/main';

const GV_Header: React.FC = () => {
  // Individual Zustand selectors - CRITICAL to avoid infinite loops
  const currentUser = useAppStore((state) => state.authentication_state.current_user);
  const isAuthenticated = useAppStore((state) => state.authentication_state.authentication_status.is_authenticated);
  const isGuest = useAppStore((state) => state.authentication_state.is_guest);
  const isLoading = useAppStore((state) => state.authentication_state.authentication_status.is_loading);
  const isOffline = useAppStore((state) => state.offline_status.is_offline);
  const searchQuery = useAppStore((state) => state.global_search_query.search_query);

  const updateGlobalSearch = useAppStore((state) => state.update_global_search);
  const logoutUser = useAppStore((state) => state.logout_user);
  const setGuestMode = useAppStore((state) => state.set_guest_mode);
  const addNotification = useAppStore((state) => state.add_notification);
  const syncOffline = useAppStore((state) => state.sync_offline);

  // Local state
  const [searchInput, setSearchInput] = useState(searchQuery || '');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);
  const [showUnsavedModal, setShowUnsavedModal] = useState(false);
  const [isOfflineBannerVisible, setIsOfflineBannerVisible] = useState(isOffline);
  const [hasUnsavedChanges] = useState(false); // Assume false for header; could be prop in future

  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  // Debounce search update
  useEffect(() => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    debounceTimer.current = setTimeout(() => {
      updateGlobalSearch(searchInput);
      if (!isAuthenticated && searchInput.trim() && !isGuest) {
        addNotification({
          type: 'warning',
          message: 'Sign in to search tasks',
          duration: 3000,
        });
      }
    }, 300);

    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, [searchInput, isAuthenticated, isGuest, updateGlobalSearch, addNotification]);

  // Sync search from store
  useEffect(() => {
    setSearchInput(searchQuery || '');
  }, [searchQuery]);

  // Handle offline banner visibility
  useEffect(() => {
    setIsOfflineBannerVisible(isOffline);
  }, [isOffline]);

  const handleLogout = () => {
    if (hasUnsavedChanges) {
      setShowUnsavedModal(true);
    } else {
      setIsLogoutConfirmOpen(true);
    }
  };

  const handleUnsavedYes = () => {
    // Assume save: In real, call save action; here, proceed
    setShowUnsavedModal(false);
    setIsLogoutConfirmOpen(true);
  };

  const handleUnsavedNo = () => {
    // Discard and logout
    setShowUnsavedModal(false);
    performLogout();
  };

  const performLogout = async () => {
    if (isAuthenticated) {
      await logoutUser();
    } else if (isGuest) {
      setGuestMode(false);
    }
    // Redirect handled in router/store
  };

  const handleLogoutConfirm = async () => {
    setIsLogoutConfirmOpen(false);
    await performLogout();
  };

  const handleSyncOffline = () => {
    syncOffline();
    addNotification({
      type: 'success',
      message: 'Attempting to sync offline actions',
      duration: 3000,
    });
    setIsOfflineBannerVisible(false); // Hide after attempt
  };

  const handleDismissOffline = () => {
    setIsOfflineBannerVisible(false);
  };

  const avatarInitial = currentUser?.name?.charAt(0)?.toUpperCase() || currentUser?.email?.charAt(0)?.toUpperCase() || 'U';

  const logoLink = isAuthenticated ? '/dashboard' : isGuest ? '/guest-dashboard' : '/';

  const placeholderText = isAuthenticated || isGuest ? 'Search tasks...' : 'Sign in to search tasks';

  return (
    <>
      {/* Header */}
      <nav
        className="fixed top-0 left-0 right-0 z-50 bg-gray-100 px-4 py-4 md:py-0 h-14 md:h-16 border-b border-gray-200 shadow-sm transition-opacity duration-300 opacity-100"
        style={{ backgroundColor: '#F8F9FA' }}
        role="banner"
        aria-label="Main navigation"
      >
        {/* Desktop Layout */}
        <div className="hidden md:flex items-center justify-between h-full max-w-7xl mx-auto">
          {/* Left: Logo */}
          <Link
            to={logoLink}
            className="flex items-center text-xl font-bold text-gray-900 hover:text-blue-600 transition-colors relative group"
            aria-label="TaskHub home"
          >
            TaskHub
            {isGuest && (
              <span className="absolute -top-1 -right-2 text-xs bg-yellow-200 text-yellow-800 px-1 py-0.5 rounded-full opacity-80">
                Guest
              </span>
            )}
          </Link>

          {/* Center: Search */}
          <div className="flex-1 max-w-md mx-8 relative">
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={placeholderText}
              onKeyDown={(e) => e.key === 'Enter' && updateGlobalSearch(searchInput)}
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm placeholder-gray-500 transition-colors"
              aria-label="Global search input"
              disabled={isLoading}
            />
            {searchInput && (
              <button
                onClick={() => setSearchInput('')}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                aria-label="Clear search"
              >
                ×
              </button>
            )}
          </div>

          {/* Right: Actions */}
          <div className="flex items-center space-x-4">
            {!isAuthenticated && !isGuest && (
              <>
                <Link
                  to="/"
                  className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
                  aria-label="Get started with TaskHub"
                >
                  Get Started
                </Link>
                <Link
                  to="/login"
                  className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
                  aria-label="Sign in to TaskHub"
                >
                  Login
                </Link>
              </>
            )}
            {(isAuthenticated || isGuest) && (
              <div className="relative">
                <button
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  className="flex items-center space-x-2 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-full"
                  aria-label="User menu"
                  aria-expanded={isDropdownOpen}
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Escape' && setIsDropdownOpen(false)}
                >
                  <div className="w-10 h-10 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm font-semibold">
                    {avatarInitial}
                  </div>
                  {isGuest && (
                    <span className="text-xs text-yellow-600 bg-yellow-100 px-2 py-1 rounded-full">
                      Guest
                    </span>
                  )}
                </button>
                {isDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg py-1 z-40 border border-gray-200 focus:outline-none">
                    <Link
                      to="#"
                      onClick={(e) => {
                        e.preventDefault();
                        setIsDropdownOpen(false);
                        setIsProfileModalOpen(true);
                      }}
                      className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                      role="menuitem"
                    >
                      Profile
                    </Link>
                    <button
                      onClick={() => {
                        setIsDropdownOpen(false);
                        if (isGuest) {
                          setGuestMode(false);
                        } else {
                          handleLogout();
                        }
                      }}
                      className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                      role="menuitem"
                    >
                      {isGuest ? 'Sign Up' : 'Logout'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Mobile Layout */}
        <div className="md:hidden flex items-center justify-between h-full">
          {/* Logo */}
          <Link to={logoLink} className="text-xl font-bold text-gray-900 hover:text-blue-600" aria-label="TaskHub home">
            TaskHub
            {isGuest && <span className="text-xs text-yellow-600 ml-1">(Guest)</span>}
          </Link>

          {/* Hamburger */}
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="md:hidden focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
            aria-label="Open menu"
            aria-expanded={isMobileMenuOpen}
          >
            <div className="w-6 h-6 flex flex-col justify-center space-y-1">
              <div className={`bg-gray-900 h-0.5 w-full rounded transition-transform ${isMobileMenuOpen ? 'rotate-45 translate-y-1.5' : ''}`}></div>
              <div className={`bg-gray-900 h-0.5 w-full rounded ${isMobileMenuOpen ? 'opacity-0' : ''}`}></div>
              <div className={`bg-gray-900 h-0.5 w-full rounded transition-transform ${isMobileMenuOpen ? '-rotate-45 -translate-y-1.5' : ''}`}></div>
            </div>
          </button>
        </div>

        {/* Mobile Menu Overlay */}
        {isMobileMenuOpen && (
          <div className="md:hidden fixed inset-0 z-40 bg-black bg-opacity-50" onClick={() => setIsMobileMenuOpen(false)} aria-hidden="true"></div>
        )}
        <div
          className={`md:hidden fixed top-16 left-0 h-full w-64 bg-white shadow-lg transform transition-transform duration-300 ease-in-out z-50 ${
            isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
          } overflow-y-auto`}
          role="menu"
          aria-label="Mobile navigation menu"
        >
          <div className="p-4 space-y-4">
            {/* Search */}
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={placeholderText}
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Global search input"
            />
            {searchInput && (
              <button onClick={() => setSearchInput('')} className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400">×</button>
            )}

            {/* Actions */}
            {!isAuthenticated && !isGuest && (
              <>
                <Link
                  to="/"
                  className="block w-full text-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  Get Started
                </Link>
                <Link to="/login" className="block w-full text-center px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50" onClick={() => setIsMobileMenuOpen(false)}>
                  Login
                </Link>
              </>
            )}
            {(isAuthenticated || isGuest) && (
              <>
                <button
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    setIsProfileModalOpen(true);
                  }}
                  className="w-full text-left px-4 py-2 text-gray-700 hover:bg-gray-100"
                >
                  Profile
                </button>
                <button
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    handleLogout();
                  }}
                  className="w-full text-left px-4 py-2 text-red-600 hover:bg-red-50"
                >
                  {isGuest ? 'Sign Up' : 'Logout'}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Loading Spinner in Header */}
        {isLoading && (
          <div className="flex justify-center items-center h-16 md:h-16 bg-gray-100">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
          </div>
        )}
      </nav>

      {/* Offline Banner */}
      {isOfflineBannerVisible && (
        <div
          className="fixed top-14 md:top-16 left-0 right-0 bg-yellow-100 border-b border-yellow-300 text-yellow-800 text-sm py-3 px-4 z-40"
          role="alert"
          aria-live="polite"
          aria-label="Offline mode active"
        >
          <div className="flex justify-between items-center max-w-7xl mx-auto">
            <span>Offline mode active – changes will sync later</span>
            <div className="flex space-x-2">
              <button
                onClick={handleSyncOffline}
                className="px-3 py-1 bg-yellow-500 text-white rounded hover:bg-yellow-600 text-sm"
                aria-label="Retry sync"
              >
                Retry
              </button>
              <button
                onClick={handleDismissOffline}
                className="px-3 py-1 text-yellow-800 hover:text-yellow-900 text-sm"
                aria-label="Dismiss offline banner"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Profile Modal */}
      {isProfileModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm"
          onClick={() => setIsProfileModalOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="User profile"
          tabIndex={-1}
        >
          <div
            className="bg-white rounded-lg p-6 max-w-sm w-11/12 md:w-4/5 max-h-96 overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Profile</h3>
              <button
                onClick={() => setIsProfileModalOpen(false)}
                className="text-gray-400 hover:text-gray-600"
                aria-label="Close profile modal"
              >
                ×
              </button>
            </div>
            <div className="space-y-2">
              <p className="text-sm text-gray-600">Email: {currentUser?.email}</p>
              {currentUser?.name && <p className="text-sm text-gray-600">Name: {currentUser.name}</p>}
            </div>
          </div>
        </div>
      )}

      {/* Unsaved Changes Modal */}
      {showUnsavedModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
          onClick={() => setShowUnsavedModal(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Unsaved changes confirmation"
        >
          <div
            className="bg-white rounded-lg p-6 max-w-md w-11/12"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-4">Unsaved changes!</h3>
            <p className="text-sm text-gray-600 mb-6">Save before logout?</p>
            <div className="flex space-x-3">
              <button
                onClick={handleUnsavedYes}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
              >
                Yes (save & logout)
              </button>
              <button
                onClick={handleUnsavedNo}
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 text-sm"
              >
                No (discard & logout)
              </button>
              <button
                onClick={() => setShowUnsavedModal(false)}
                className="px-4 py-2 text-gray-600 hover:text-gray-900 text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Logout Confirm Modal */}
      {isLogoutConfirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
          onClick={() => setIsLogoutConfirmOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Logout confirmation"
        >
          <div
            className="bg-white rounded-lg p-6 max-w-md w-11/12"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-4">Log out?</h3>
            <p className="text-sm text-gray-600 mb-6">Are you sure you want to log out?</p>
            <div className="flex space-x-3">
              <button
                onClick={handleLogoutConfirm}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 text-sm"
              >
                Yes
              </button>
              <button
                onClick={() => setIsLogoutConfirmOpen(false)}
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 text-sm"
              >
                No
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Adjust main content top padding for header + banner */}
      <style>{`
        main {
          padding-top: ${isOfflineBannerVisible ? '120px' : '64px'};
        }
        @media (min-width: 768px) {
          main {
            padding-top: ${isOfflineBannerVisible ? '132px' : '76px'};
          }
        }
      `}</style>
    </>
  );
};

export default GV_Header;