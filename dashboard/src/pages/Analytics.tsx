import React from 'react';
import { ChartBarIcon } from '@heroicons/react/24/outline';

const Analytics: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Analytics</h1>
          <p className="text-dark-400 mt-1">View performance analytics and trading insights</p>
        </div>
      </div>

      <div className="text-center py-12">
        <ChartBarIcon className="h-16 w-16 text-dark-400 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-white mb-2">Analytics Dashboard</h2>
        <p className="text-dark-400">
          Advanced analytics and performance metrics coming soon...
        </p>
      </div>
    </div>
  );
};

export default Analytics; 