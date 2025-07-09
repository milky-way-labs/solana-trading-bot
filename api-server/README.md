# Solana Trading Bot API Server

Un servizio API completo per gestire multiple istanze del bot di trading Solana con dashboard real-time.

## 🚀 Caratteristiche

- **Multi-Instance Management**: Gestisci multiple istanze del bot contemporaneamente
- **Real-time WebSocket**: Aggiornamenti in tempo reale per dashboard esterne
- **Metrics & Analytics**: Monitoraggio completo delle performance dei bot
- **Authentication**: Sistema di autenticazione JWT con ruoli
- **Database Integration**: Persistenza di configurazioni e metriche
- **RESTful API**: Interfaccia completa per integrazione con dashboard

## 📋 Prerequisiti

- Node.js 18+
- npm o yarn
- SQLite3 (per database)
- Bot Solana configurato nella directory padre

## 🔧 Installazione

1. **Installa le dipendenze:**
```bash
cd api-server
npm install
```

2. **Configura le variabili d'ambiente:**
```bash
# Crea file .env
cp .env.example .env
```

3. **Avvia il server:**
```bash
# Sviluppo
npm run dev

# Produzione
npm run build
npm start
```

## 🌐 Endpoints API

### Autenticazione

- `POST /api/auth/login` - Login utente
- `POST /api/auth/register` - Registra nuovo utente (solo admin)
- `GET /api/auth/me` - Informazioni utente corrente
- `POST /api/auth/change-password` - Cambia password

### Gestione Bot

- `GET /api/bots` - Lista tutti i bot
- `POST /api/bots` - Crea nuovo bot
- `GET /api/bots/:id` - Dettagli bot specifico
- `PUT /api/bots/:id` - Aggiorna configurazione bot
- `DELETE /api/bots/:id` - Elimina bot
- `POST /api/bots/:id/start` - Avvia bot
- `POST /api/bots/:id/stop` - Ferma bot
- `POST /api/bots/:id/restart` - Riavvia bot
- `GET /api/bots/:id/logs` - Logs del bot
- `POST /api/bots/bulk-action` - Azioni bulk su multiple istanze

### Metriche

- `GET /api/metrics/system` - Metriche di sistema
- `GET /api/metrics/system/history` - Storico metriche sistema
- `GET /api/metrics/bots` - Metriche tutti i bot
- `GET /api/metrics/bots/:id` - Metriche bot specifico
- `GET /api/metrics/bots/:id/history` - Storico metriche bot
- `GET /api/metrics/bots/:id/trades` - Riassunto trades bot
- `GET /api/metrics/performance` - Metriche performance
- `GET /api/metrics/alerts` - Alert attivi

### Configurazione

- `GET /api/config` - Configurazione corrente
- `PUT /api/config` - Aggiorna configurazione
- `POST /api/config/validate` - Valida configurazione
- `POST /api/config/reset` - Reset configurazione

### Health Check

- `GET /health` - Stato del servizio

## 🔌 WebSocket Events

Il server supporta WebSocket per aggiornamenti real-time:

### Eventi dal Server

- `bot_created` - Nuovo bot creato
- `bot_updated` - Bot aggiornato
- `bot_deleted` - Bot eliminato
- `bot_started` - Bot avviato
- `bot_stopped` - Bot fermato
- `bot_log` - Nuovo log dal bot
- `bot_error` - Errore nel bot
- `bot_trade` - Nuovo trade eseguito
- `system_metrics_updated` - Metriche sistema aggiornate
- `system_alert` - Nuovo alert di sistema
- `heartbeat` - Heartbeat del server

### Sottoscrizioni

Connettiti al WebSocket e invia:

```javascript
// Sottoscrivi a tutti i bot
socket.emit('subscribe', {
  topics: ['all_bots', 'system_metrics', 'system_alerts'],
  botIds: []
});

// Sottoscrivi a bot specifici
socket.emit('subscribe', {
  topics: ['dashboard'],
  botIds: ['bot-id-1', 'bot-id-2']
});
```

## 📊 Struttura Database

### Tabelle

- `bot_configs` - Configurazioni dei bot
- `metrics` - Metriche storiche
- `trades` - Storico trades

### Schema Bot Config

```json
{
  "id": "uuid",
  "name": "Bot Name",
  "description": "Description",
  "enabled": true,
  "config": {
    "privateKey": "base58-key",
    "rpcEndpoint": "https://...",
    "quoteMint": "WSOL",
    "quoteAmount": "0.002",
    "maxTokensAtTheTime": 3,
    "autoSell": true,
    "takeProfit": 40,
    "stopLoss": 100,
    "enableAutoBlacklistRugs": true,
    "useTechnicalAnalysis": false,
    "useTelegram": false
  }
}
```

## 🔐 Autenticazione

L'API utilizza JWT tokens per l'autenticazione:

```javascript
// Header richiesto
Authorization: Bearer <jwt-token>

// Login
POST /api/auth/login
{
  "username": "admin",
  "password": "password"
}

// Risposta
{
  "success": true,
  "data": {
    "token": "jwt-token-here",
    "user": {
      "id": "admin",
      "username": "admin", 
      "role": "admin"
    }
  }
}
```

## 🏗️ Architettura

```
api-server/
├── services/           # Servizi business logic
│   ├── BotManager.ts   # Gestione istanze bot
│   ├── DatabaseService.ts # Persistenza dati
│   ├── MetricsService.ts # Raccolta metriche
│   ├── Logger.ts       # Logging
│   ├── ConfigService.ts # Configurazione
│   └── WebSocketService.ts # WebSocket real-time
├── routes/            # API endpoints
│   ├── authRoutes.ts  # Autenticazione
│   ├── botRoutes.ts   # Gestione bot
│   ├── metricsRoutes.ts # Metriche
│   └── configRoutes.ts # Configurazione
├── middleware/        # Middleware Express
│   └── AuthMiddleware.ts # Autenticazione JWT
├── data/             # Database SQLite
└── logs/             # Log files
```

## 📈 Monitoraggio

### Metriche Sistema

- CPU e Memory usage
- Numero bot attivi/fermi/errore
- Totale trades e profitti
- Uptime sistema

### Metriche Bot

- Status e uptime
- Trades totali e successi
- Profitti e perdite
- Win rate e profit/hour
- Posizioni correnti

### Alert

- Bot in errore
- Basso win rate
- Bot inattivi
- Alto uso memoria

## 🔧 Configurazione Avanzata

### Variabili Ambiente

```bash
# Server
API_PORT=3000
NODE_ENV=development

# Database
DATABASE_PATH=./data/bot_manager.db
DB_CLEANUP_DAYS=30

# Security
JWT_SECRET=your-secret-key-change-this
JWT_EXPIRES_IN=24h
BCRYPT_ROUNDS=10

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=100

# WebSocket
WEBSOCKET_ENABLED=true
WEBSOCKET_MAX_CONNECTIONS=100

# Bot Management
MAX_BOT_INSTANCES=10
BOT_DATA_RETENTION_DAYS=90
DEFAULT_RPC_ENDPOINT=https://api.mainnet-beta.solana.com

# Monitoring
METRICS_INTERVAL=30000
HEALTH_CHECK_INTERVAL=60000
```

## 🚀 Deployment

### Docker (Consigliato)

```dockerfile
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

EXPOSE 3000
CMD ["npm", "start"]
```

### PM2

```bash
# Installa PM2
npm install -g pm2

# Avvia con PM2
pm2 start npm --name "bot-api" -- start
pm2 startup
pm2 save
```

## 📚 Esempi di Integrazione

### JavaScript/Node.js

```javascript
const axios = require('axios');
const io = require('socket.io-client');

// API Client
class BotApiClient {
  constructor(baseURL, token) {
    this.api = axios.create({
      baseURL,
      headers: { Authorization: `Bearer ${token}` }
    });
  }

  async createBot(config) {
    const response = await this.api.post('/api/bots', config);
    return response.data;
  }

  async startBot(botId) {
    const response = await this.api.post(`/api/bots/${botId}/start`);
    return response.data;
  }

  async getBots() {
    const response = await this.api.get('/api/bots');
    return response.data;
  }
}

// WebSocket Client
const socket = io('http://localhost:3000');

socket.on('connect', () => {
  console.log('Connected to bot API');
  
  // Sottoscrivi agli eventi
  socket.emit('subscribe', {
    topics: ['all_bots', 'system_metrics'],
    botIds: []
  });
});

socket.on('bot_started', (data) => {
  console.log('Bot started:', data);
});

socket.on('bot_log', (data) => {
  console.log('Bot log:', data);
});
```

### React Dashboard

```jsx
import { useEffect, useState } from 'react';
import io from 'socket.io-client';

function BotDashboard() {
  const [bots, setBots] = useState([]);
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    const newSocket = io('http://localhost:3000');
    setSocket(newSocket);

    newSocket.on('connect', () => {
      newSocket.emit('subscribe', {
        topics: ['all_bots'],
        botIds: []
      });
    });

    newSocket.on('bot_started', (data) => {
      console.log('Bot started:', data);
      fetchBots();
    });

    newSocket.on('bot_stopped', (data) => {
      console.log('Bot stopped:', data);
      fetchBots();
    });

    return () => newSocket.close();
  }, []);

  const fetchBots = async () => {
    try {
      const response = await fetch('/api/bots', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      setBots(data.data);
    } catch (error) {
      console.error('Error fetching bots:', error);
    }
  };

  return (
    <div>
      <h1>Bot Dashboard</h1>
      {bots.map(bot => (
        <BotCard key={bot.id} bot={bot} />
      ))}
    </div>
  );
}
```

## 🔍 Troubleshooting

### Problemi Comuni

1. **Bot non si avvia**
   - Controlla configurazione private key
   - Verifica RPC endpoint
   - Controlla log del bot

2. **Errori di autenticazione**
   - Verifica JWT token
   - Controlla scadenza token
   - Rigenera token se necessario

3. **WebSocket non funziona**
   - Controlla CORS settings
   - Verifica firewall
   - Controlla connessione di rete

### Debug

```bash
# Abilita debug mode
LOG_LEVEL=debug npm start

# Controlla log
tail -f logs/combined.log

# Verifica database
sqlite3 data/bot_manager.db ".tables"
```

## 🤝 Contributing

1. Fork il repository
2. Crea feature branch
3. Commit le modifiche
4. Push al branch
5. Crea Pull Request

## 📄 License

MIT License - vedere LICENSE file per dettagli.

## 🆘 Support

- GitHub Issues per bug reports
- Discord per discussioni
- Email per supporto enterprise

---

**Nota**: Questo è un sistema di trading automatico. Usa sempre chiavi di test in development e fai backup delle configurazioni importanti. 