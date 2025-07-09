import React, { useState, useEffect } from 'react';
import { 
  ServerIcon, 
  CurrencyDollarIcon, 
  ChartBarIcon, 
  ClockIcon,
  PlayIcon,
  StopIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon
} from '@heroicons/react/24/outline';
import { useAuth } from '../contexts/AuthContext';
import { SystemMetrics, BotInstance } from '../types';
import apiService from '../services/api';
import websocketService from '../services/websocket';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { toast } from 'react-hot-toast';

const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const [systemMetrics, setSystemMetrics] = useState<SystemMetrics | null>(null);
  const [bots, setBots] = useState<BotInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
    setupWebSocketListeners();
    
    // Subscribe to real-time updates
    websocketService.subscribeToAll();
    
    // Refresh data every 30 seconds
    const interval = setInterval(loadData, 30000);
    
    return () => {
      clearInterval(interval);
      websocketService.unsubscribe(['all_bots', 'system_metrics']);
    };
  }, []);

  const loadData = async () => {
    try {
      setError(null);
      const [systemResponse, botsResponse] = await Promise.all([
        apiService.getSystemMetrics(),
        apiService.getBots()
      ]);

      if (systemResponse.success && systemResponse.data) {
        setSystemMetrics(systemResponse.data);
      } else {
        throw new Error(systemResponse.error || 'Failed to load system metrics');
      }

      if (botsResponse.success && botsResponse.data) {
        setBots(botsResponse.data);
      } else {
        throw new Error(botsResponse.error || 'Failed to load bots');
      }
    } catch (err: any) {
      setError(err.message);
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const setupWebSocketListeners = () => {
    websocketService.on('system_metrics_updated', (data) => {
      setSystemMetrics(data.data);
    });

    websocketService.on('bot_status_changed', (data) => {
      setBots(prev => prev.map(bot => 
        bot.id === data.botId ? { ...bot, status: data.data.status } : bot
      ));
    });

    websocketService.on('bot_updated', (data) => {
      setBots(prev => prev.map(bot => 
        bot.id === data.botId ? { ...bot, ...data.data } : bot
      ));
    });
  };

  const handleBotAction = async (botId: string, action: 'start' | 'stop') => {
    try {
      const response = action === 'start' 
        ? await apiService.startBot(botId)
        : await apiService.stopBot(botId);

      if (response.success) {
        toast.success(`Bot ${action}ed successfully`);
        loadData(); // Refresh data
      } else {
        toast.error(response.error || `Failed to ${action} bot`);
      }
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running': return 'text-success-500';
      case 'stopped': return 'text-dark-400';
      case 'error': return 'text-danger-500';
      case 'starting': return 'text-warning-500';
      case 'stopping': return 'text-warning-500';
      default: return 'text-dark-400';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <LoadingSpinner size="large" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <ExclamationTriangleIcon className="h-16 w-16 text-danger-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-white mb-2">Error Loading Dashboard</h2>
          <p className="text-dark-400 mb-4">{error}</p>
          <button
            onClick={loadData}
            className="btn btn-primary"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Welcome Header */}
      <div className="bg-gradient-to-r from-primary-600 to-primary-700 rounded-lg p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">
              Welcome back, {user?.username}!
            </h1>
            <p className="text-primary-100 mt-1">
              Here's what's happening with your trading bots today.
            </p>
          </div>
          <div className="text-right">
            <div className="text-primary-100 text-sm">System Status</div>
            <div className="flex items-center mt-1">
              <CheckCircleIcon className="h-5 w-5 text-success-400 mr-2" />
              <span className="text-white font-medium">Online</span>
            </div>
          </div>
        </div>
      </div>

      {/* System Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="card-gradient rounded-lg p-6">
          <div className="flex items-center">
            <div className="p-3 rounded-full bg-primary-600">
              <ServerIcon className="h-6 w-6 text-white" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-dark-400">Total Bots</p>
              <p className="text-2xl font-bold text-white">{systemMetrics?.totalBots || 0}</p>
            </div>
          </div>
        </div>

        <div className="card-gradient rounded-lg p-6">
          <div className="flex items-center">
            <div className="p-3 rounded-full bg-success-600">
              <PlayIcon className="h-6 w-6 text-white" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-dark-400">Running Bots</p>
              <p className="text-2xl font-bold text-white">{systemMetrics?.runningBots || 0}</p>
            </div>
          </div>
        </div>

        <div className="card-gradient rounded-lg p-6">
          <div className="flex items-center">
            <div className="p-3 rounded-full bg-warning-600">
              <CurrencyDollarIcon className="h-6 w-6 text-white" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-dark-400">Total Trades</p>
              <p className="text-2xl font-bold text-white">{systemMetrics?.totalTrades || 0}</p>
            </div>
          </div>
        </div>

        <div className="card-gradient rounded-lg p-6">
          <div className="flex items-center">
            <div className="p-3 rounded-full bg-danger-600">
              <ChartBarIcon className="h-6 w-6 text-white" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-dark-400">Total Profit</p>
              <p className="text-2xl font-bold text-white">
                ${((systemMetrics?.totalProfit || 0) - (systemMetrics?.totalLoss || 0)).toFixed(2)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Bots */}
      <div className="card-gradient rounded-lg p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">Your Bots</h2>
          <button className="btn btn-primary btn-sm">
            Manage Bots
          </button>
        </div>

        <div className="space-y-4">
          {bots.slice(0, 5).map((bot) => (
            <div key={bot.id} className="flex items-center justify-between p-4 bg-dark-800 rounded-lg">
              <div className="flex items-center">
                <div className={`w-3 h-3 rounded-full mr-3 ${
                  bot.status === 'running' ? 'bg-success-500' :
                  bot.status === 'error' ? 'bg-danger-500' :
                  bot.status === 'starting' || bot.status === 'stopping' ? 'bg-warning-500' :
                  'bg-dark-400'
                }`} />
                <div>
                  <h3 className="font-medium text-white">{bot.config.name}</h3>
                  <p className="text-sm text-dark-400">{bot.config.description || 'No description'}</p>
                </div>
              </div>
              
              <div className="flex items-center space-x-3">
                <div className="text-right">
                  <div className={`text-sm font-medium ${getStatusColor(bot.status)}`}>
                    {bot.status.charAt(0).toUpperCase() + bot.status.slice(1)}
                  </div>
                  <div className="text-xs text-dark-400">
                    {bot.metrics.totalTrades} trades
                  </div>
                </div>
                
                <div className="flex space-x-2">
                  {bot.status === 'running' ? (
                    <button
                      onClick={() => handleBotAction(bot.id, 'stop')}
                      className="btn btn-sm btn-warning"
                    >
                      <StopIcon className="h-4 w-4" />
                    </button>
                  ) : (
                    <button
                      onClick={() => handleBotAction(bot.id, 'start')}
                      className="btn btn-sm btn-success"
                    >
                      <PlayIcon className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
          
          {bots.length === 0 && (
            <div className="text-center py-8">
              <ServerIcon className="h-12 w-12 text-dark-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-white mb-2">No bots configured</h3>
              <p className="text-dark-400 mb-4">Get started by creating your first trading bot.</p>
              <button className="btn btn-primary">
                Create Bot
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard; 