import React, { useState, useEffect } from 'react';

const GV_Footer: React.FC = () => {
  const [modalType, setModalType] = useState<'about' | 'privacy' | null>(null);

  const openModal = (type: 'about' | 'privacy') => {
    setModalType(type);
  };

  const closeModal = () => {
    setModalType(null);
  };

  // Handle ESC key to close modal
  useEffect(() => {
    const handleEscKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && modalType) {
        closeModal();
      }
    };

    if (modalType) {
      document.addEventListener('keydown', handleEscKey);
      return () => document.removeEventListener('keydown', handleEscKey);
    }
  }, [modalType]);

  const modalContent = {
    about: 'TaskHub is a simple task manager for productivity. © 2023.',
    privacy: 'User data is stored per account, no unauthorized sharing beyond explicit links.',
  };

  return (
    <>
      <footer className="fixed bottom-0 left-0 right-0 bg-gray-100 py-2 sm:py-3 px-4 z-10 border-t border-gray-200">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center space-y-1 sm:space-y-0">
          <div className="flex flex-col sm:flex-row items-center space-y-1 sm:space-y-0 sm:space-x-4 text-sm text-gray-600">
            <button
              onClick={() => openModal('about')}
              className="hover:text-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded px-1 py-0.5 transition-colors duration-200 underline-offset-2 hover:underline"
              aria-label="Open About modal"
            >
              About
            </button>
            <span className="hidden sm:inline text-gray-400">|</span>
            <span className="sm:hidden mx-1 text-gray-400"> | </span>
            <button
              onClick={() => openModal('privacy')}
              className="hover:text-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded px-1 py-0.5 transition-colors duration-200 underline-offset-2 hover:underline"
              aria-label="Open Privacy modal"
            >
              Privacy
            </button>
            <span className="hidden sm:inline text-gray-400">|</span>
            <span className="sm:hidden mx-1 text-gray-400"> | </span>
            <a
              href="mailto:support@taskhub.com"
              className="hover:text-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded px-1 py-0.5 transition-colors duration-200 underline-offset-2 hover:underline"
              aria-label="Contact support via email"
            >
              Contact
            </a>
          </div>
          <div className="text-xs italic text-gray-500 text-right">
            © 2023 TaskHub. All rights reserved.
          </div>
        </div>
      </footer>

      {/* Modals */}
      {modalType && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4 transition-opacity duration-300"
            onClick={closeModal}
            aria-hidden="true"
          />
          {/* Modal */}
          <div
            className={`fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-11/12 sm:w-4/5 max-w-md bg-white rounded-lg shadow-xl p-6 z-50 max-h-[80vh] overflow-y-auto transition-transform duration-300 ease-out translate-y-0 ${
              modalType ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
            }`}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${modalType}-title`}
            aria-label={`${modalType.charAt(0).toUpperCase() + modalType.slice(1)} modal`}
          >
            <div className="flex justify-between items-center mb-4">
              <h3 id={`${modalType}-title`} className="text-lg font-semibold text-gray-900 capitalize">
                {modalType}
              </h3>
              <button
                onClick={closeModal}
                className="text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded p-1 transition-colors duration-200"
                aria-label="Close modal"
              >
                <svg
                  className="h-6 w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="text-gray-700 text-sm prose prose-sm max-w-none">
              <p>{modalContent[modalType]}</p>
            </div>
          </div>
        </>
      )}
    </>
  );
};

export default GV_Footer;