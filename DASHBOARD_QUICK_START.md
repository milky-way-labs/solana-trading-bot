# 🚀 Guida Rapida Dashboard Bot Solana

## ✅ **STATO ATTUALE SISTEMA**

Il tuo sistema è **GIÀ ATTIVO** e funzionante:

- ✅ **Bot Trading**: Attivo e operativo (auto-blacklist funzionante)
- ✅ **Dashboard Web**: Attiva su http://localhost:3000
- ✅ **Auto-protezione**: Sistema anti-rug funzionante

---

## 🌐 **ACCESSO ALLA DASHBOARD**

### **URL Dashboard**
```
http://localhost:3000
```

### **Credenziali di Accesso**
- **Username**: `admin`
- **Password**: `password`

---

## 🎯 **COSA PUOI FARE**

### **1. Monitoraggio Real-time**
- Visualizzare stato bot attuale
- Seguire trade in tempo reale  
- Controllare blacklist aggiornata
- Monitorare profitti/perdite

### **2. Controllo Bot**
- Start/Stop bot
- Modificare parametri trading
- Gestire blacklist manualmente
- Configurare alert

### **3. Analytics**
- Grafici performance
- Storico trade
- Analisi rug pull rilevati
- Statistiche sistema

---

## 🔧 **TROUBLESHOOTING**

### **Dashboard Non Carica?**
```bash
# 1. Controlla se è attiva
lsof -i :3000

# 2. Riavvia se necessario  
cd dashboard
npm start
```

### **Bot Non Risponde?**
```bash
# 1. Controlla processo bot
ps aux | grep "ts-node index.ts"

# 2. Riavvia bot se necessario
npm start
```

### **Errori di Connessione?**
```bash
# Verifica che entrambi siano attivi
curl http://localhost:3000
```

---

## 📱 **UTILIZZO DASHBOARD**

### **Step 1: Login**
1. Apri browser su `http://localhost:3000`
2. Inserisci credenziali admin
3. Accedi alla dashboard

### **Step 2: Monitoraggio**
- **Dashboard** → Overview generale sistema
- **Bot Management** → Controlli bot
- **Analytics** → Statistiche e grafici
- **Settings** → Configurazioni

### **Step 3: Gestione**
- Modifica parametri trading
- Gestisci blacklist
- Configura alert
- Monitora performance

---

## 🛡️ **SICUREZZA ATTIVA**

Il tuo bot ha **protezione automatica** attiva:

### **Auto-Blacklist** 
- Rileva automaticamente rug pull (-90%)
- Aggiunge token pericolosi alla blacklist
- Protegge da investimenti rischiosi

### **Token Già Protetti**
- ✅ TRUTH (rilevato rug -90%)
- ✅ SpaceX (rilevato rug -90%)  
- ✅ TikTok (rilevato rug -90%)
- ✅ Altri token rug rilevati automaticamente

---

## 📊 **MONITORAGGIO BOT**

### **Parametri Attuali**
- 💰 **Buy Amount**: 0.002 SOL
- 📈 **Take Profit**: 40%
- 🛑 **Stop Loss**: 100%
- 🎯 **Max Tokens**: 3 contemporanei
- ⏱️ **Price Check**: Ogni 3 secondi

### **Filtri Attivi**
- ✅ Symbol blacklist (18 token bloccati)
- ✅ Auto-blacklist rug pull
- ✅ Protezione Tesla, DeepSeekAI, etc.

---

## 🚨 **COMANDI RAPIDI**

### **Riavvio Completo Sistema**
```bash
# Kill tutti i processi
pkill -f "ts-node"
pkill -f "react-scripts"

# Riavvia bot
npm start &

# Riavvia dashboard
cd dashboard && npm start &
```

### **Solo Dashboard**
```bash
cd dashboard
npm start
```

### **Solo Bot Trading**
```bash
npm start
```

---

## 💡 **TIPS & TRICKS**

### **Performance Ottimale**
- Tieni entrambi i processi attivi
- Monitora la dashboard per aggiornamenti real-time
- Controlla regolarmente la blacklist aggiornata

### **Sicurezza**
- Cambia password admin al primo accesso
- Monitora alert sistema
- Verifica blacklist auto-aggiornamenti

### **Troubleshooting**
- Se la dashboard non si carica, riavvia con `npm start`
- Se il bot non fa trade, controlla la blacklist
- Per errori Telegram, ignora (non influenzano il trading)

---

## ✨ **SISTEMA PRONTO ALL'USO**

Il tuo setup è **completo e operativo**:

🎯 **Dashboard**: http://localhost:3000  
🤖 **Bot Trading**: Attivo e protetto  
🛡️ **Auto-protezione**: Funzionante  
📊 **Monitoraggio**: Real-time disponibile  

**Accedi alla dashboard e inizia a monitorare i tuoi trade!** 🚀 