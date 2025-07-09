import React from 'react';
import { NavLink } from 'react-router-dom';
import { 
  HomeIcon, 
  CogIcon, 
  ChartBarIcon, 
  ServerIcon,
  UserGroupIcon,
  DocumentTextIcon,
  XMarkIcon,
  Bars3Icon
} from '@heroicons/react/24/outline';
import { useAuth } from '../../contexts/AuthContext';

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ isOpen, onToggle }) => {
  const { user, isAdmin } = useAuth();

  const menuItems = [
    {
      name: 'Dashboard',
      href: '/',
      icon: HomeIcon,
      requiresAdmin: false
    },
    {
      name: 'Bot Management',
      href: '/bots',
      icon: ServerIcon,
      requiresAdmin: false
    },
    {
      name: 'Analytics',
      href: '/analytics',
      icon: ChartBarIcon,
      requiresAdmin: false
    },
    {
      name: 'Settings',
      href: '/settings',
      icon: CogIcon,
      requiresAdmin: false
    },
    {
      name: 'Users',
      href: '/users',
      icon: UserGroupIcon,
      requiresAdmin: true
    },
    {
      name: 'Logs',
      href: '/logs',
      icon: DocumentTextIcon,
      requiresAdmin: false
    }
  ];

  const filteredMenuItems = menuItems.filter(item => 
    !item.requiresAdmin || isAdmin
  );

  return (
    <>
      {/* Desktop sidebar */}
      <div className={`fixed inset-y-0 left-0 z-50 ${isOpen ? 'w-64' : 'w-16'} bg-dark-800 transition-all duration-300 border-r border-dark-700`}>
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-dark-700">
            <div className={`${isOpen ? 'block' : 'hidden'} transition-all duration-300`}>
              <h1 className="text-xl font-bold text-gradient">
                Solana Bot
              </h1>
            </div>
            <button
              onClick={onToggle}
              className="p-2 rounded-md hover:bg-dark-700 transition-colors"
            >
              {isOpen ? (
                <XMarkIcon className="h-6 w-6" />
              ) : (
                <Bars3Icon className="h-6 w-6" />
              )}
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4 space-y-2">
            {filteredMenuItems.map((item) => (
              <NavLink
                key={item.name}
                to={item.href}
                className={({ isActive }) =>
                  `flex items-center p-3 rounded-lg transition-all duration-200 ${
                    isActive
                      ? 'bg-primary-600 text-white'
                      : 'text-dark-300 hover:bg-dark-700 hover:text-white'
                  }`
                }
              >
                <item.icon className="h-6 w-6 flex-shrink-0" />
                <span className={`ml-3 ${isOpen ? 'block' : 'hidden'} transition-all duration-300`}>
                  {item.name}
                </span>
              </NavLink>
            ))}
          </nav>

          {/* User info */}
          <div className="p-4 border-t border-dark-700">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-10 h-10 rounded-full bg-primary-600 flex items-center justify-center">
                  <span className="text-white font-semibold">
                    {user?.username?.charAt(0).toUpperCase() || 'U'}
                  </span>
                </div>
              </div>
              <div className={`ml-3 ${isOpen ? 'block' : 'hidden'} transition-all duration-300`}>
                <p className="text-sm font-medium text-white">
                  {user?.username}
                </p>
                <p className="text-xs text-dark-400 capitalize">
                  {user?.role}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile sidebar overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={onToggle}
        />
      )}
    </>
  );
};

export default Sidebar; 