import { Router, Request, Response } from 'express';
import { MetricsService } from '../services/MetricsService';
import { AuthRequest } from '../middleware/AuthMiddleware';

export function metricsRoutes(metricsService: MetricsService): Router {
  const router = Router();

  // GET /api/metrics/system - Get system metrics
  router.get('/system', async (req: AuthRequest, res: Response) => {
    try {
      const metrics = metricsService.getSystemMetrics();
      res.json({
        success: true,
        data: metrics
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve system metrics'
      });
    }
  });

  // GET /api/metrics/system/history - Get system metrics history
  router.get('/system/history', async (req: AuthRequest, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const history = metricsService.getSystemMetricsHistory(limit);
      res.json({
        success: true,
        data: history
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve system metrics history'
      });
    }
  });

  // GET /api/metrics/bots - Get all bot metrics
  router.get('/bots', async (req: AuthRequest, res: Response) => {
    try {
      const metrics = metricsService.getAllBotMetrics();
      res.json({
        success: true,
        data: metrics
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve bot metrics'
      });
    }
  });

  // GET /api/metrics/bots/:id - Get specific bot metrics
  router.get('/bots/:id', async (req: AuthRequest, res: Response) => {
    try {
      const botId = req.params.id;
      const metrics = metricsService.getBotMetrics(botId);
      
      if (!metrics) {
        return res.status(404).json({
          success: false,
          error: 'Bot metrics not found'
        });
      }

      res.json({
        success: true,
        data: metrics
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve bot metrics'
      });
    }
  });

  // GET /api/metrics/bots/:id/history - Get bot metrics history
  router.get('/bots/:id/history', async (req: AuthRequest, res: Response) => {
    try {
      const botId = req.params.id;
      const limit = parseInt(req.query.limit as string) || 100;
      const history = await metricsService.getBotMetricsHistory(botId, limit);
      
      res.json({
        success: true,
        data: history
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve bot metrics history'
      });
    }
  });

  // GET /api/metrics/bots/:id/trades - Get bot trades summary
  router.get('/bots/:id/trades', async (req: AuthRequest, res: Response) => {
    try {
      const botId = req.params.id;
      const summary = await metricsService.getBotTradesSummary(botId);
      
      res.json({
        success: true,
        data: summary
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve bot trades summary'
      });
    }
  });

  // GET /api/metrics/performance - Get performance metrics
  router.get('/performance', async (req: AuthRequest, res: Response) => {
    try {
      const performance = metricsService.getPerformanceMetrics();
      res.json({
        success: true,
        data: performance
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve performance metrics'
      });
    }
  });

  // GET /api/metrics/alerts - Get current alerts
  router.get('/alerts', async (req: AuthRequest, res: Response) => {
    try {
      const alerts = metricsService.getAlerts();
      res.json({
        success: true,
        data: alerts
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve alerts'
      });
    }
  });

  return router;
} 