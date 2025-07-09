import React from 'react';
import { CogIcon } from '@heroicons/react/24/outline';

const Settings: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Settings</h1>
          <p className="text-dark-400 mt-1">Configure your dashboard and system preferences</p>
        </div>
      </div>

      <div className="text-center py-12">
        <CogIcon className="h-16 w-16 text-dark-400 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-white mb-2">Settings</h2>
        <p className="text-dark-400">
          Dashboard settings and configuration options coming soon...
        </p>
      </div>
    </div>
  );
};

export default Settings; 