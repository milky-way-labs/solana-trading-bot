# 🚀 Solana Bot Dashboard System

Sistema completo per gestire multiple istanze di bot trading Solana con dashboard web moderna, API REST e WebSocket real-time.

## 📋 Panoramica Sistema

Il sistema è composto da due componenti principali:

- **API Server** (`/api-server`) - Backend Node.js con Express, WebSocket, database SQLite
- **Dashboard** (`/dashboard`) - Frontend React con Tailwind CSS, autenticazione JWT

## ⚡ Quick Start

### 1. Avvio Rapido con Docker

```bash
# Clona il repository
git clone <repository-url>
cd solana-trading-bot

# Avvia tutto con Docker Compose
docker-compose up -d

# Accedi alla dashboard
open http://localhost:3001
```

**Credenziali di default:**
- Username: `admin`
- Password: `admin123`

### 2. Installazione Manuale

#### API Server
```bash
cd api-server
npm install
npm run build
npm start
```

#### Dashboard
```bash
cd dashboard
npm install
npm start
```

## 🏗️ Architettura Sistema

```
├── api-server/                 # Backend API
│   ├── server.ts              # Express server
│   ├── services/              # Core services
│   ├── routes/                # API endpoints
│   ├── middleware/            # Authentication & validation
│   └── README.md
│
├── dashboard/                  # Frontend React
│   ├── src/
│   │   ├── components/        # UI components
│   │   ├── pages/             # Route pages
│   │   ├── services/          # API & WebSocket
│   │   └── types/             # TypeScript types
│   └── README.md
│
└── docker-compose.yml         # Deployment
```

## 🔧 Configurazione

### API Server (.env)
```bash
# Server
PORT=3000
NODE_ENV=production

# Database
DATABASE_PATH=./data/database.sqlite

# JWT
JWT_SECRET=your-super-secret-key
JWT_EXPIRES_IN=24h

# WebSocket
WEBSOCKET_ENABLED=true
WEBSOCKET_MAX_CONNECTIONS=100

# Bot Management
MAX_BOT_INSTANCES=10
DATA_RETENTION_DAYS=30
```

### Dashboard (.env)
```bash
# API Configuration
REACT_APP_API_URL=http://localhost:3000
REACT_APP_WS_URL=http://localhost:3000

# Development
REACT_APP_DEBUG=false
```

## 🎯 Funzionalità Principali

### 🔐 Autenticazione
- Login sicuro con JWT
- Gestione sessioni
- Ruoli utente (admin/user)
- Cambio password

### 🤖 Gestione Bot
- Creazione/configurazione bot
- Start/Stop/Restart istanze
- Monitoraggio real-time
- Configurazione parametri trading

### 📊 Dashboard & Analytics
- Overview sistema
- Metriche performance
- Grafici real-time
- Alert e notifiche

### 🔄 Real-time Updates
- WebSocket per aggiornamenti live
- Streaming logs
- Status changes
- System alerts

## 🚀 Deployment

### Docker Compose (Raccomandato)

```bash
# Produzione
docker-compose up -d

# Sviluppo con logs
docker-compose up

# Rebuild dopo modifiche
docker-compose up --build
```

### Docker Manuale

```bash
# Build API Server
docker build -t solana-bot-api ./api-server

# Build Dashboard
docker build -t solana-bot-dashboard ./dashboard

# Run API Server
docker run -d -p 3000:3000 \
  -v $(pwd)/api-server/data:/app/data \
  solana-bot-api

# Run Dashboard
docker run -d -p 3001:80 \
  -e REACT_APP_API_URL=http://localhost:3000 \
  solana-bot-dashboard
```

### Produzione con Nginx

```nginx
# /etc/nginx/sites-available/solana-bot
server {
    listen 80;
    server_name your-domain.com;
    
    # Dashboard
    location / {
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
    
    # API
    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## 📱 Utilizzo Dashboard

### 1. Login
- Accedere a `http://localhost:3001`
- Username: `admin`, Password: `admin123`
- Cambiare password al primo accesso

### 2. Gestione Bot
- **Creare Bot**: Cliccare "Create Bot" e configurare parametri
- **Avviare Bot**: Cliccare play button nella lista bot
- **Monitorare**: Dashboard mostra status real-time
- **Configurare**: Modificare parametri trading, RPC, etc.

### 3. Monitoraggio
- **Sistema**: CPU, memoria, uptime
- **Bot**: Trades, profitti, stato
- **Logs**: Streaming real-time dei logs
- **Alerts**: Notifiche per eventi importanti

## 🔒 Sicurezza

### Autenticazione
- JWT tokens con scadenza
- Password hashing con bcrypt
- Rate limiting API
- Input validation

### Comunicazione
- HTTPS in produzione
- WebSocket autenticato
- CORS configurato
- Security headers

### Deployment
- Secrets management
- Environment variables
- Database encryption
- Backup automatici

## 📊 API Endpoints

### Autenticazione
```
POST /api/auth/login          # Login
POST /api/auth/register       # Register
GET  /api/auth/me            # Current user
POST /api/auth/change-password # Change password
```

### Bot Management
```
GET    /api/bots             # Lista bot
POST   /api/bots             # Crea bot
GET    /api/bots/:id         # Dettagli bot
PUT    /api/bots/:id         # Aggiorna bot
DELETE /api/bots/:id         # Elimina bot
POST   /api/bots/:id/start   # Avvia bot
POST   /api/bots/:id/stop    # Ferma bot
```

### Metriche
```
GET /api/metrics/system      # Metriche sistema
GET /api/metrics/bots        # Metriche bot
GET /api/metrics/performance # Performance
GET /api/metrics/alerts      # Alerts
```

## 🔄 WebSocket Events

### Bot Events
- `bot_created` - Nuovo bot creato
- `bot_updated` - Bot aggiornato
- `bot_started` - Bot avviato
- `bot_stopped` - Bot fermato
- `bot_log` - Nuovo log entry
- `bot_error` - Errore bot

### Sistema Events
- `system_metrics_updated` - Metriche aggiornate
- `system_alert` - Alert sistema
- `dashboard_update` - Aggiornamento dashboard

## 🐛 Troubleshooting

### Problemi Comuni

#### API Server non risponde
```bash
# Controllare logs
docker logs solana-bot-api

# Verificare database
ls -la api-server/data/

# Riavviare servizio
docker restart solana-bot-api
```

#### Dashboard non carica
```bash
# Verificare build
cd dashboard && npm run build

# Controllare variabili ambiente
cat dashboard/.env

# Controllare connessione API
curl http://localhost:3000/health
```

#### WebSocket disconnesso
```bash
# Verificare configurazione
grep WEBSOCKET api-server/.env

# Controllare firewall
sudo ufw status

# Test connessione
wscat -c ws://localhost:3000
```

### Debug Mode

```bash
# API Server debug
cd api-server
NODE_ENV=development npm run dev

# Dashboard debug
cd dashboard
REACT_APP_DEBUG=true npm start
```

## 📈 Performance

### Ottimizzazioni
- Database indexing
- WebSocket connection pooling
- React component memoization
- Nginx gzip compression
- Static asset caching

### Monitoring
- Health checks endpoint
- Performance metrics
- Resource usage tracking
- Error logging

## 🔄 Aggiornamenti

### Aggiornare Sistema
```bash
# Fermare servizi
docker-compose down

# Aggiornare codice
git pull origin main

# Ribuilare e avviare
docker-compose up --build -d
```

### Backup Database
```bash
# Backup automatico
cp api-server/data/database.sqlite api-server/data/backup-$(date +%Y%m%d).sqlite

# Restore
cp api-server/data/backup-20240101.sqlite api-server/data/database.sqlite
```

## 🤝 Contribuire

1. Fork repository
2. Crea feature branch
3. Commit changes
4. Push to branch
5. Create Pull Request

## 📄 Licenza

MIT License - vedi LICENSE per dettagli.

---

## 🆘 Support

Per supporto:
- Aprire issue su GitHub
- Controllare logs: `docker logs solana-bot-api`
- Verificare configurazione
- Consultare documentazione API

**Sistema completo e pronto per la produzione!** 🚀 