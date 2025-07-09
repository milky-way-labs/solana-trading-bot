#!/bin/bash

echo "🚀 Verifica Sistema Bot Solana Dashboard"
echo "========================================="

# Controlla bot trading
echo -n "🤖 Bot Trading: "
if pgrep -f "ts-node index.ts" > /dev/null; then
    echo "✅ ATTIVO"
else
    echo "❌ NON ATTIVO"
fi

# Controlla dashboard
echo -n "🌐 Dashboard: "
if lsof -i :3000 > /dev/null 2>&1; then
    echo "✅ ATTIVO (http://localhost:3000)"
else
    echo "❌ NON ATTIVO"
fi

# Test connettività dashboard
echo -n "🔗 Connessione Dashboard: "
if curl -s "http://localhost:3000" | grep -q "Solana Bot Dashboard"; then
    echo "✅ FUNZIONANTE"
else
    echo "❌ PROBLEMA CONNESSIONE"
fi

# Controlla blacklist auto-aggiornata
echo -n "🛡️ Auto-blacklist: "
if grep -q "TRUTH.*AUTO-ADDED" storage/symbol-blacklist.txt; then
    echo "✅ ATTIVA (TRUTH rilevato)"
else
    echo "⚠️  DA VERIFICARE"
fi

# Conta token in blacklist
BLACKLIST_COUNT=$(grep -c "^[^#]" storage/symbol-blacklist.txt 2>/dev/null || echo "0")
echo "📋 Token in blacklist: $BLACKLIST_COUNT"

echo ""
echo "🎯 ACCESSO DASHBOARD:"
echo "   URL: http://localhost:3000"
echo "   Username: admin"
echo "   Password: password (o admin123)"
echo ""

# Se tutto ok
if pgrep -f "ts-node index.ts" > /dev/null && lsof -i :3000 > /dev/null 2>&1; then
    echo "🎉 SISTEMA COMPLETAMENTE OPERATIVO!"
    echo "   Apri http://localhost:3000 nel browser"
else
    echo "⚠️  ALCUNI SERVIZI NON ATTIVI"
    echo "   Esegui: npm start (per bot)"
    echo "   Esegui: cd dashboard && npm start (per dashboard)"
fi 