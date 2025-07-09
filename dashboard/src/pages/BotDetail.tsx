import React from 'react';
import { ChartBarIcon } from '@heroicons/react/24/outline';

const BotDetail: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Bot Details</h1>
          <p className="text-dark-400 mt-1">View detailed information about your trading bot</p>
        </div>
      </div>

      <div className="text-center py-12">
        <ChartBarIcon className="h-16 w-16 text-dark-400 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-white mb-2">Bot Details</h2>
        <p className="text-dark-400">
          Detailed bot analytics and configuration coming soon...
        </p>
      </div>
    </div>
  );
};

export default BotDetail; 