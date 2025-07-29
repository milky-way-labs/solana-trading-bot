import { Filter, FilterResult } from './pool-filters';
import { Connection } from '@solana/web3.js';
import { LiquidityPoolKeysV4 } from '@raydium-io/raydium-sdk';
import { getPdaMetadataKey } from '@raydium-io/raydium-sdk';
import { MetadataAccountData, MetadataAccountDataArgs, getMetadataAccountDataSerializer } from '@metaplex-foundation/mpl-token-metadata';
import { Serializer } from '@metaplex-foundation/umi/serializers';
import { logger } from '../helpers';
import fs from 'fs';
import path from 'path';

export class SymbolBlacklistFilter implements Filter {
  private symbolBlacklist: string[] = [];
  private fileLocation = path.join(__dirname, '../storage/symbol-blacklist.txt');

  constructor(private readonly connection: Connection) {
    this.loadSymbolBlacklist();
    // Ricarica la lista ogni 10 minuti
    setInterval(() => this.loadSymbolBlacklist(), 600000);
  }

  getName(): string {
    return 'SymbolBlacklistFilter';
  }

  async execute(poolKeys: LiquidityPoolKeysV4): Promise<FilterResult> {
    try {
      // Se la blacklist è vuota, non filtrare nulla
      if (this.symbolBlacklist.length === 0) {
        return { ok: true };
      }

      let metadataSerializer: Serializer<MetadataAccountDataArgs, MetadataAccountData> = getMetadataAccountDataSerializer();

      const metadataPDA = getPdaMetadataKey(poolKeys.baseMint);
      const metadataAccount = await this.connection.getAccountInfo(metadataPDA.publicKey, this.connection.commitment);

      if (!metadataAccount?.data) {
        return { ok: true }; // Se non riusciamo a leggere metadata, lasciamo passare
      }

      const deserialize = metadataSerializer.deserialize(metadataAccount.data);
      
      // Migliore gestione dell'encoding e pulizia dei caratteri
      let tokenName = '';
      let tokenSymbol = '';
      
      try {
        // Converti i bytes in stringa e pulisci caratteri non validi
        const rawName = deserialize[0].name || '';
        const rawSymbol = deserialize[0].symbol || '';
        
        // Rimuovi caratteri null e non printabili, mantieni solo caratteri validi
        tokenName = this.cleanString(rawName);
        tokenSymbol = this.cleanString(rawSymbol);
        
      } catch (encodingError) {
        logger.debug({ mint: poolKeys.baseMint }, `SymbolBlacklist -> Encoding error: ${encodingError}`);
        return { ok: true }; // In caso di errore di encoding, lasciamo passare
      }

      // Controlla se nome o simbolo sono nella blacklist
      for (const blacklistedItem of this.symbolBlacklist) {
        const blacklistedLower = blacklistedItem.toLowerCase();
        const tokenNameLower = tokenName.toLowerCase();
        const tokenSymbolLower = tokenSymbol.toLowerCase();

        // Controllo esatto
        if (tokenNameLower === blacklistedLower || tokenSymbolLower === blacklistedLower) {
          return { 
            ok: false, 
            message: `SymbolBlacklist -> BLOCKED: "${tokenSymbol}" (${tokenName}) - exact match with "${blacklistedItem}"` 
          };
        }

        // Controllo se contiene la stringa blacklistata
        if (tokenNameLower.includes(blacklistedLower) || tokenSymbolLower.includes(blacklistedLower)) {
          return { 
            ok: false, 
            message: `SymbolBlacklist -> BLOCKED: "${tokenSymbol}" (${tokenName}) - contains "${blacklistedItem}"` 
          };
        }
      }

      logger.trace({ 
        mint: poolKeys.baseMint 
      }, `SymbolBlacklist -> PASSED: "${tokenSymbol}" (${tokenName})`);

      return { ok: true };

    } catch (e) {
      logger.error({ mint: poolKeys.baseMint }, `SymbolBlacklist -> Failed to check symbol blacklist: ${e}`);
      return { ok: true }; // In caso di errore, lasciamo passare per non bloccare tutto
    }
  }

  private cleanString(input: string): string {
    if (!input) return '';
    
    // Rimuovi caratteri null, di controllo e non printabili
    return input
      .replace(/\0/g, '') // Rimuovi caratteri null
      .replace(/[\x00-\x1F\x7F-\x9F]/g, '') // Rimuovi caratteri di controllo
      .trim(); // Rimuovi spazi all'inizio e fine
  }

  private loadSymbolBlacklist() {
    try {
      if (!fs.existsSync(this.fileLocation)) {
        // Crea il file con alcuni esempi se non esiste
        const defaultBlacklist = [
          'PEPE2',
          'DOGE2', 
          'SHIB2',
          'SCAM',
          'RUG',
          'FAKE',
          'TEST',
          'COPY',
          'CLONE'
        ].join('\n');
        
        fs.writeFileSync(this.fileLocation, defaultBlacklist, 'utf-8');
        logger.info('SymbolBlacklist -> Created default symbol-blacklist.txt');
      }

      const previousCount = this.symbolBlacklist.length;
      const data = fs.readFileSync(this.fileLocation, 'utf-8');
      
      this.symbolBlacklist = data
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith('#')) // Ignora righe vuote e commenti
        .map((line) => this.cleanString(line)) // Pulisci ogni elemento della blacklist
        .filter((line) => line.length > 0); // Rimuovi elementi vuoti dopo la pulizia

      if (this.symbolBlacklist.length !== previousCount) {
        logger.info(`SymbolBlacklist -> Loaded ${this.symbolBlacklist.length} blacklisted symbols/names`);
      }

    } catch (error) {
      logger.error(`SymbolBlacklist -> Failed to load symbol blacklist: ${error}`);
      this.symbolBlacklist = []; // Resetta in caso di errore
    }
  }
} 