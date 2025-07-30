# Migrazione Database - Separazione Data e Ora

## Panoramica

Questa migrazione separa le colonne datetime in colonne separate per data e ora, rendendo i dati più leggibili e facili da filtrare.

## Modifiche Apportate

### 1. Database MongoDB (db.ts)

#### Entità Trade
- Aggiunta colonna `findDate` (YYYY-MM-DD)
- Aggiunta colonna `findTime` (HH:mm:ss)
- Aggiunta colonna `poolOpenDate` (YYYY-MM-DD)
- Aggiunta colonna `poolOpenTime` (HH:mm:ss)
- Aggiunta colonna `buyDate` (YYYY-MM-DD) - nullable
- Aggiunta colonna `buyTime` (HH:mm:ss) - nullable
- Aggiunta colonna `sellDate` (YYYY-MM-DD) - nullable
- Aggiunta colonna `sellTime` (HH:mm:ss) - nullable

#### Entità TokenCandidate
- Aggiunta colonna `findDate` (YYYY-MM-DD)
- Aggiunta colonna `findTime` (HH:mm:ss)
- Aggiunta colonna `poolOpenDate` (YYYY-MM-DD)
- Aggiunta colonna `poolOpenTime` (HH:mm:ss)
- Aggiunta colonna `buyDate` (YYYY-MM-DD) - nullable
- Aggiunta colonna `buyTime` (HH:mm:ss) - nullable
- Aggiunta colonna `sellDate` (YYYY-MM-DD) - nullable
- Aggiunta colonna `sellTime` (HH:mm:ss) - nullable

### 2. API Server SQLite (DatabaseService.ts)

#### Interfacce
- `DatabaseMetrics`: aggiunte `date` e `time`
- `DatabaseTrade`: aggiunte `date` e `time`
- `DatabaseTokenCandidate`: aggiunte `date` e `time`

#### Tabelle SQLite
- `metrics`: aggiunte colonne `date` e `time`
- `trades`: aggiunte colonne `date` e `time`
- `token_candidates`: aggiunte colonne `date` e `time`

### 3. Dashboard TypeScript (types/index.ts)

#### Interfacce
- `SystemMetrics`: aggiunte `date` e `time`
- `Trade`: aggiunte `date` e `time`

### 4. Funzioni Helper

#### `formatDateAndTime(date: Date)`
Nuova funzione che separa una data in formato stringa:
- `date`: formato YYYY-MM-DD
- `time`: formato HH:mm:ss

## Formato Dati

### Prima
```json
{
  "findDateTime": "2025-07-29T21:29:02.000+00:00"
}
```

### Dopo
```json
{
  "findDateTime": "2025-07-29T21:29:02.000+00:00",
  "findDate": "2025-07-29",
  "findTime": "21:29:02"
}
```

## Esecuzione Migrazione

### 1. Eseguire lo Script di Migrazione

```bash
# Compila TypeScript
npx tsc migrate-database.ts

# Esegui la migrazione
node migrate-database.js
```

### 2. Verificare i Dati

```bash
# Controlla il database
node check-database.ts
```

## Vantaggi

1. **Leggibilità**: Le date sono ora in formato leggibile YYYY-MM-DD
2. **Ore pulite**: Le ore sono in formato HH:mm:ss senza millisecondi
3. **Filtri**: Possibilità di filtrare per data senza considerare l'ora
4. **Compatibilità**: Le colonne datetime originali sono mantenute per compatibilità
5. **Performance**: Indici aggiuntivi sulle colonne date per query più veloci

## Note Importanti

- Le colonne datetime originali sono mantenute per compatibilità
- I nuovi dati vengono salvati con entrambi i formati
- La migrazione aggiorna solo i record esistenti che non hanno le nuove colonne
- Il formato ora è sempre in timezone locale (italiano)

## Rollback

Se necessario, è possibile rimuovere le nuove colonne mantenendo le colonne datetime originali. Le funzioni di salvataggio continueranno a funzionare con le colonne datetime esistenti. 