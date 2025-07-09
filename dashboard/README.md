# Solana Bot Dashboard

Una dashboard web moderna per gestire multiple istanze di bot trading Solana con interfaccia real-time, autenticazione e monitoraggio completo.

## ✨ Caratteristiche

- **🔐 Autenticazione JWT** - Sistema di login sicuro
- **📊 Dashboard Real-time** - Monitoraggio live dei bot e metriche
- **🤖 Gestione Bot** - Crea, configura e controlla i bot
- **📈 Analytics** - Analisi performance e trading
- **🔔 Notifiche** - Alerts e notifiche real-time
- **📱 Responsive Design** - Ottimizzato per mobile e desktop
- **🎨 UI Moderna** - Design scuro con animazioni fluide

## 🚀 Installazione

### Pre-requisiti

- Node.js 18+ 
- npm o yarn
- API Server running (vedi `/api-server`)

### 1. Installazione Dipendenze

```bash
cd dashboard
npm install
```

### 2. Configurazione

Crea un file `.env` nella root della dashboard:

```bash
# Dashboard Configuration
REACT_APP_API_URL=http://localhost:3000
REACT_APP_WS_URL=http://localhost:3000
```

### 3. Avvio Sviluppo

```bash
npm start
```

La dashboard sarà disponibile su `http://localhost:3001`

### 4. Build Produzione

```bash
npm run build
```

## 🏗️ Architettura

```
dashboard/
├── public/                 # File statici
├── src/
│   ├── components/        # Componenti React
│   │   ├── common/       # Componenti comuni
│   │   └── layout/       # Layout e navigazione
│   ├── contexts/         # Context API
│   ├── pages/            # Pagine principali
│   ├── services/         # API e WebSocket
│   ├── types/            # Tipi TypeScript
│   └── index.tsx         # Entry point
├── tailwind.config.js    # Configurazione Tailwind
├── tsconfig.json         # Configurazione TypeScript
└── package.json
```

## 🎯 Funzionalità Principali

### Dashboard
- Overview sistema e bot
- Metriche real-time
- Controlli rapidi bot
- Status di connessione

### Gestione Bot
- Lista completa bot
- Creazione nuovi bot
- Configurazione parametri
- Start/Stop/Restart
- Monitoraggio stato

### Analytics
- Performance metrics
- Grafici profitti/perdite
- Analisi trading
- Report dettagliati

### Autenticazione
- Login sicuro
- Gestione sessioni
- Ruoli utente
- Cambio password

## 📡 Integrazione API

La dashboard comunica con l'API server tramite:

### REST API
- Autenticazione: `/api/auth/*`
- Bot Management: `/api/bots/*`
- Metriche: `/api/metrics/*`
- Configurazione: `/api/config/*`

### WebSocket
- Aggiornamenti real-time
- Notifiche sistema
- Log streaming
- Status changes

## 🎨 Styling

### Tailwind CSS
- Design system personalizzato
- Tema scuro ottimizzato
- Componenti responsivi
- Animazioni fluide

### Colori Principali
- **Primary**: Blu (#3b82f6)
- **Success**: Verde (#10b981)
- **Warning**: Arancione (#f59e0b)
- **Danger**: Rosso (#ef4444)
- **Dark**: Grigio scuro (#0f172a)

## 🔧 Configurazione Avanzata

### Variabili Ambiente

```bash
# API Configuration
REACT_APP_API_URL=http://localhost:3000
REACT_APP_WS_URL=http://localhost:3000

# Development
REACT_APP_DEBUG=true
REACT_APP_LOG_LEVEL=debug
```

### Proxy Configuration

Il file `package.json` include un proxy per sviluppo:

```json
"proxy": "http://localhost:3000"
```

## 🔐 Sicurezza

### Autenticazione
- JWT tokens con scadenza
- Refresh automatico
- Logout su token scaduto
- Protezione routes

### Comunicazione
- HTTPS in produzione
- WebSocket autenticato
- Validazione input
- Sanitizzazione dati

## 📱 Responsiveness

### Breakpoints
- **Mobile**: < 768px
- **Tablet**: 768px - 1024px
- **Desktop**: > 1024px

### Ottimizzazioni Mobile
- Sidebar collapsible
- Touch-friendly controls
- Swipe gestures
- Responsive tables

## 🚀 Deployment

### Docker (Raccomandato)

```bash
# Build immagine
docker build -t solana-bot-dashboard .

# Run container
docker run -d -p 3001:80 \
  -e REACT_APP_API_URL=http://your-api-server \
  solana-bot-dashboard
```

### Nginx

```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    location / {
        root /var/www/dashboard/build;
        index index.html;
        try_files $uri $uri/ /index.html;
    }
    
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

## 🔄 Aggiornamenti Real-time

### WebSocket Events
- `bot_created` - Nuovo bot creato
- `bot_updated` - Bot aggiornato
- `bot_started` - Bot avviato
- `bot_stopped` - Bot fermato
- `bot_log` - Nuovo log entry
- `system_metrics_updated` - Metriche aggiornate
- `system_alert` - Alert di sistema

### Subscription Management
```javascript
// Subscribe to all bots
websocketService.subscribeToAll();

// Subscribe to specific bot
websocketService.subscribeToBot(botId);

// Handle events
websocketService.on('bot_updated', (data) => {
  // Update UI
});
```

## 🐛 Troubleshooting

### Problemi Comuni

1. **API non raggiungibile**
   - Verificare URL API in `.env`
   - Controllare che l'API server sia running
   - Verificare CORS settings

2. **WebSocket disconnesso**
   - Controllare configurazione WebSocket
   - Verificare network connectivity
   - Riavviare entrambi i servizi

3. **Autenticazione fallita**
   - Controllare credenziali
   - Verificare JWT secret
   - Controllare database utenti

### Debug Mode

```bash
# Abilita debug logging
REACT_APP_DEBUG=true npm start
```

## 📊 Performance

### Ottimizzazioni Implementate
- Lazy loading components
- Memoization React
- WebSocket connection pooling
- Optimistic updates
- Caching API responses

### Monitoraggio Performance
- React DevTools
- Network tab
- WebSocket stats
- Memory usage

## 🤝 Contribuire

1. Fork il repository
2. Crea feature branch
3. Commit changes
4. Push to branch
5. Create Pull Request

## 📄 Licenza

MIT License - vedi `LICENSE` file per dettagli.

## 🆘 Support

Per supporto e domande:
- Aprire un issue su GitHub
- Controllare la documentazione
- Verificare i logs

---

**Nota**: Questa dashboard è progettata per funzionare con l'API server incluso. Assicurarsi che entrambi i servizi siano running e configurati correttamente. 