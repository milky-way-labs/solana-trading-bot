# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a comprehensive Solana trading bot system with three main components:
1. **Main Bot** (`/`) - Core trading bot written in TypeScript/Node.js
2. **API Server** (`/api-server`) - Express.js backend for managing multiple bot instances
3. **Dashboard** (`/dashboard`) - React frontend for real-time monitoring and control

## Common Development Commands

### Main Bot
```bash
# Run the bot
npm run start

# Type check only (no emit)
npm run tsc

# Install dependencies
npm install
```

### API Server
```bash
# Start development server with auto-reload
cd api-server && npm run dev

# Start production server
cd api-server && npm start

# Build TypeScript
cd api-server && npm run build

# Run tests
cd api-server && npm test
```

### Dashboard
```bash
# Start development server
cd dashboard && npm start

# Build for production
cd dashboard && npm run build

# Run tests
cd dashboard && npm test

# Format code
cd dashboard && npm run format

# Lint code
cd dashboard && npm run lint
```

## Architecture Overview

### Main Bot Structure
- **Entry Point**: `index.ts` - Main bot orchestrator
- **Bot Logic**: `bot.ts` - Core trading implementation with pump.fun support
- **Listeners**: `listeners/` - WebSocket event handlers for Raydium pools and pump.fun tokens
- **Filters**: `filters/` - Token filtering logic (burn, renounced, blacklist, pump.fun specific)
- **Transactions**: `transactions/` - Different transaction executors (default, Jito, Warp)
- **Cache**: `cache/` - In-memory caching for markets, pools, blacklists, pump.fun tokens
- **Helpers**: `helpers/` - Utility functions including pump.fun bonding curve calculations
- **Database**: Uses MongoDB with TypeORM for trade logging and token events

### API Server Structure
- **Server**: `server.ts` - Express app with WebSocket support
- **Services**: Core business logic (BotManager, DatabaseService, MetricsService)
- **Routes**: RESTful API endpoints for bot management, metrics, auth
- **Middleware**: JWT authentication and validation
- **Database**: SQLite for bot configurations and metrics storage

### Dashboard Structure
- **Frontend**: React with TypeScript and Tailwind CSS
- **Services**: API client and WebSocket service for real-time updates
- **Components**: Reusable UI components with responsive design
- **Pages**: Main dashboard, bot management, analytics views

## Key Technical Details

### Database Systems
- **Main Bot**: MongoDB (default: `mongodb://localhost:27017/solana-trading-bot`)
- **API Server**: SQLite (stored in `api-server/data/`)
- **Unified Structure**: Recent migration to unified TokenEvent schema

### Configuration
- Main bot uses `.env` file (copy from `.env.copy`)
- API server uses environment variables for JWT, database, WebSocket settings
- Dashboard configured via React environment variables

### Pump.fun Integration
- **Enable**: Set `ENABLE_PUMP_FUN_LISTENER=true` in .env
- **Program IDs**: pump.fun main (`6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P`) and migration (`39azUYFWPz3VHgKCf3VChUwbpURdCHRxjWVowf5jUJjg`)
- **Filtering**: Market cap and bonding curve progress thresholds
- **Architecture**: Separate listeners, filters, cache, and helper classes for pump.fun
- **Token Decimals**: pump.fun uses 6 decimals vs standard 9

### TypeScript Configuration
- **Decorators**: Experimental decorators enabled for TypeORM
- **Strict Mode**: Disabled (`"strict": false`)
- **Module System**: CommonJS with ES module interop
- **Target**: ES2016

### Real-time Communication
- WebSocket integration between all components
- Events: bot status changes, trade updates, system metrics
- Authentication: JWT-based with role management

## Database Migration Scripts

Several migration utilities are available:
- `migrate-database.ts` - General database migrations
- `migrate-to-unified-db.ts` - Migration to unified TokenEvent structure
- `check-database.ts` - Database inspection and verification

## Testing Strategy

### Main Bot
- No specific test framework configured
- Manual testing recommended with testnet/devnet
- Use `LOG_LEVEL=debug` for detailed logging

### API Server & Dashboard
- Jest configured for unit testing
- Use `npm test` in respective directories
- Integration testing for API endpoints

## Common Patterns

### Error Handling
- Extensive try/catch blocks in trading logic
- Retry mechanisms for transactions (configurable retries)
- Blacklist system for automatic rug protection

### Logging
- Pino logger for structured logging
- Different log levels: trace, debug, info, warn, error
- Log rotation and pretty printing in development

### State Management
- In-memory caching for performance-critical data
- Database persistence for trade history and configuration
- WebSocket for real-time state synchronization

## Security Considerations

- Private keys stored in environment variables
- JWT tokens for API authentication
- Input validation and sanitization
- Rate limiting on API endpoints
- CORS configuration for dashboard

## Deployment Notes

- Docker support with compose configuration
- Environment-specific configuration files
- Database backup and migration procedures
- Health check endpoints for monitoring