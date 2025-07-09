import { Router, Request, Response } from 'express';
import { ConfigService } from '../services/ConfigService';
import { AuthRequest } from '../middleware/AuthMiddleware';

export function configRoutes(configService: ConfigService): Router {
  const router = Router();

  // GET /api/config - Get current configuration
  router.get('/', async (req: AuthRequest, res: Response) => {
    try {
      const config = configService.getConfig();
      res.json({
        success: true,
        data: config
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve configuration'
      });
    }
  });

  // PUT /api/config - Update configuration
  router.put('/', async (req: AuthRequest, res: Response) => {
    try {
      configService.updateConfig(req.body);
      const updatedConfig = configService.getConfig();
      
      res.json({
        success: true,
        data: updatedConfig,
        message: 'Configuration updated successfully'
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: 'Failed to update configuration'
      });
    }
  });

  // POST /api/config/validate - Validate configuration
  router.post('/validate', async (req: AuthRequest, res: Response) => {
    try {
      const isValid = configService.validateConfig();
      res.json({
        success: true,
        data: { isValid },
        message: isValid ? 'Configuration is valid' : 'Configuration is invalid'
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: 'Failed to validate configuration'
      });
    }
  });

  // POST /api/config/reset - Reset to default configuration
  router.post('/reset', async (req: AuthRequest, res: Response) => {
    try {
      configService.resetToDefaults();
      const config = configService.getConfig();
      
      res.json({
        success: true,
        data: config,
        message: 'Configuration reset to defaults'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to reset configuration'
      });
    }
  });

  return router;
} 