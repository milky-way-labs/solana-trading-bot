import React, { useState, useEffect } from 'react';
import { BellIcon, UserIcon, PowerIcon, Cog6ToothIcon } from '@heroicons/react/24/outline';
import { useAuth } from '../../contexts/AuthContext';
import { User } from '../../types';
import websocketService from '../../services/websocket';
import { Menu, Transition } from '@headlessui/react';

interface HeaderProps {
  user: User | null;
  onToggleSidebar: () => void;
}

const Header: React.FC<HeaderProps> = ({ user, onToggleSidebar }) => {
  const { logout } = useAuth();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // WebSocket connection status
    const handleConnect = () => setIsConnected(true);
    const handleDisconnect = () => setIsConnected(false);

    websocketService.on('connect', handleConnect);
    websocketService.on('disconnect', handleDisconnect);

    // Subscribe to system alerts
    websocketService.on('system_alert', (data) => {
      setNotifications(prev => [data, ...prev.slice(0, 9)]);
    });

    // Initial connection status
    setIsConnected(websocketService.isConnected());

    return () => {
      websocketService.off('connect', handleConnect);
      websocketService.off('disconnect', handleDisconnect);
    };
  }, []);

  const handleLogout = () => {
    logout();
  };

  return (
    <header className="bg-dark-800 border-b border-dark-700 px-6 py-4">
      <div className="flex items-center justify-between">
        {/* Left side - WebSocket status */}
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-success-500' : 'bg-danger-500'}`} />
            <span className="text-sm text-dark-300">
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
        </div>

        {/* Right side - User menu */}
        <div className="flex items-center space-x-4">
          {/* Notifications */}
          <div className="relative">
            <button className="p-2 rounded-full hover:bg-dark-700 transition-colors">
              <BellIcon className="h-6 w-6 text-dark-300" />
              {notifications.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-danger-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                  {notifications.length}
                </span>
              )}
            </button>
          </div>

          {/* User dropdown */}
          <Menu as="div" className="relative">
            <Menu.Button className="flex items-center space-x-2 p-2 rounded-full hover:bg-dark-700 transition-colors">
              <div className="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center">
                <span className="text-white font-semibold text-sm">
                  {user?.username?.charAt(0).toUpperCase() || 'U'}
                </span>
              </div>
              <span className="text-dark-300 text-sm">
                {user?.username}
              </span>
            </Menu.Button>

            <Transition
              as={React.Fragment}
              enter="transition ease-out duration-100"
              enterFrom="transform opacity-0 scale-95"
              enterTo="transform opacity-100 scale-100"
              leave="transition ease-in duration-75"
              leaveFrom="transform opacity-100 scale-100"
              leaveTo="transform opacity-0 scale-95"
            >
              <Menu.Items className="absolute right-0 mt-2 w-48 bg-dark-800 rounded-md shadow-lg border border-dark-700 focus:outline-none">
                <div className="py-1">
                  <Menu.Item>
                    {({ active }) => (
                      <button
                        className={`${
                          active ? 'bg-dark-700' : ''
                        } flex items-center w-full px-4 py-2 text-sm text-dark-300`}
                      >
                        <UserIcon className="h-4 w-4 mr-2" />
                        Profile
                      </button>
                    )}
                  </Menu.Item>
                  <Menu.Item>
                    {({ active }) => (
                      <button
                        className={`${
                          active ? 'bg-dark-700' : ''
                        } flex items-center w-full px-4 py-2 text-sm text-dark-300`}
                      >
                        <Cog6ToothIcon className="h-4 w-4 mr-2" />
                        Settings
                      </button>
                    )}
                  </Menu.Item>
                  <div className="border-t border-dark-700 my-1" />
                  <Menu.Item>
                    {({ active }) => (
                      <button
                        onClick={handleLogout}
                        className={`${
                          active ? 'bg-dark-700' : ''
                        } flex items-center w-full px-4 py-2 text-sm text-danger-400`}
                      >
                        <PowerIcon className="h-4 w-4 mr-2" />
                        Logout
                      </button>
                    )}
                  </Menu.Item>
                </div>
              </Menu.Items>
            </Transition>
          </Menu>
        </div>
      </div>
    </header>
  );
};

export default Header; 