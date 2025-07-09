import React from 'react';
import { ServerIcon } from '@heroicons/react/24/outline';

const BotManagement: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Bot Management</h1>
          <p className="text-dark-400 mt-1">Create, configure, and manage your trading bots</p>
        </div>
        <button className="btn btn-primary">
          Create New Bot
        </button>
      </div>

      <div className="text-center py-12">
        <ServerIcon className="h-16 w-16 text-dark-400 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-white mb-2">Bot Management</h2>
        <p className="text-dark-400">
          Full bot management interface coming soon...
        </p>
      </div>
    </div>
  );
};

export default BotManagement; 