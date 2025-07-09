import { Router, Request, Response } from 'express';
import { BotManager } from '../services/BotManager';
import { AuthRequest } from '../middleware/AuthMiddleware';

export function botRoutes(botManager: BotManager): Router {
  const router = Router();

  // GET /api/bots - Get all bots
  router.get('/', async (req: AuthRequest, res: Response) => {
    try {
      const bots = botManager.getAllBots();
      res.json({
        success: true,
        data: bots.map(bot => ({
          id: bot.id,
          name: bot.config.name,
          description: bot.config.description,
          status: bot.status,
          enabled: bot.config.enabled,
          pid: bot.pid,
          startedAt: bot.startedAt,
          metrics: bot.metrics,
          createdAt: bot.config.createdAt,
          updatedAt: bot.config.updatedAt
        }))
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve bots'
      });
    }
  });

  // GET /api/bots/:id - Get specific bot
  router.get('/:id', async (req: AuthRequest, res: Response) => {
    try {
      const bot = botManager.getBotInstance(req.params.id);
      if (!bot) {
        return res.status(404).json({
          success: false,
          error: 'Bot not found'
        });
      }

      res.json({
        success: true,
        data: bot
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve bot'
      });
    }
  });

  // POST /api/bots - Create new bot
  router.post('/', async (req: AuthRequest, res: Response) => {
    try {
      const bot = await botManager.createBot(req.body);
      res.status(201).json({
        success: true,
        data: bot,
        message: 'Bot created successfully'
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create bot'
      });
    }
  });

  // PUT /api/bots/:id - Update bot
  router.put('/:id', async (req: AuthRequest, res: Response) => {
    try {
      const bot = await botManager.updateBot(req.params.id, req.body);
      res.json({
        success: true,
        data: bot,
        message: 'Bot updated successfully'
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update bot'
      });
    }
  });

  // DELETE /api/bots/:id - Delete bot
  router.delete('/:id', async (req: AuthRequest, res: Response) => {
    try {
      await botManager.deleteBot(req.params.id);
      res.json({
        success: true,
        message: 'Bot deleted successfully'
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete bot'
      });
    }
  });

  // POST /api/bots/:id/start - Start bot
  router.post('/:id/start', async (req: AuthRequest, res: Response) => {
    try {
      await botManager.startBot(req.params.id);
      res.json({
        success: true,
        message: 'Bot started successfully'
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to start bot'
      });
    }
  });

  // POST /api/bots/:id/stop - Stop bot
  router.post('/:id/stop', async (req: AuthRequest, res: Response) => {
    try {
      await botManager.stopBot(req.params.id);
      res.json({
        success: true,
        message: 'Bot stopped successfully'
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to stop bot'
      });
    }
  });

  // POST /api/bots/:id/restart - Restart bot
  router.post('/:id/restart', async (req: AuthRequest, res: Response) => {
    try {
      await botManager.restartBot(req.params.id);
      res.json({
        success: true,
        message: 'Bot restarted successfully'
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to restart bot'
      });
    }
  });

  // GET /api/bots/:id/logs - Get bot logs
  router.get('/:id/logs', async (req: AuthRequest, res: Response) => {
    try {
      const bot = botManager.getBotInstance(req.params.id);
      if (!bot) {
        return res.status(404).json({
          success: false,
          error: 'Bot not found'
        });
      }

      const limit = parseInt(req.query.limit as string) || 100;
      const logs = bot.logs.slice(-limit);

      res.json({
        success: true,
        data: logs
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve bot logs'
      });
    }
  });

  // POST /api/bots/bulk-action - Bulk actions on multiple bots
  router.post('/bulk-action', async (req: AuthRequest, res: Response) => {
    try {
      const { action, botIds } = req.body;
      
      if (!action || !Array.isArray(botIds)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid request format'
        });
      }

      const results = [];
      
      for (const botId of botIds) {
        try {
          switch (action) {
            case 'start':
              await botManager.startBot(botId);
              results.push({ botId, success: true });
              break;
            case 'stop':
              await botManager.stopBot(botId);
              results.push({ botId, success: true });
              break;
            case 'restart':
              await botManager.restartBot(botId);
              results.push({ botId, success: true });
              break;
            default:
              results.push({ botId, success: false, error: 'Unknown action' });
          }
        } catch (error) {
          results.push({ 
            botId, 
            success: false, 
            error: error instanceof Error ? error.message : 'Action failed' 
          });
        }
      }

      res.json({
        success: true,
        data: results
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to execute bulk action'
      });
    }
  });

  return router;
} 