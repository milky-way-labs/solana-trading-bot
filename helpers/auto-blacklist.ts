import { Connection } from '@solana/web3.js';
import { getPdaMetadataKey } from '@raydium-io/raydium-sdk';
import { MetadataAccountData, MetadataAccountDataArgs, getMetadataAccountDataSerializer } from '@metaplex-foundation/mpl-token-metadata';
import { Serializer } from '@metaplex-foundation/umi/serializers';
import { logger } from './logger';
import fs from 'fs';
import path from 'path';

export class AutoBlacklist {
  private readonly symbolBlacklistFile: string;
  private readonly connection: Connection;
  private readonly enabled: boolean;
  private readonly lossThreshold: number;

  constructor(connection: Connection, enabled: boolean = true, lossThreshold: number = 80) {
    this.connection = connection;
    this.enabled = enabled;
    this.lossThreshold = lossThreshold;
    this.symbolBlacklistFile = path.join(__dirname, '../storage/symbol-blacklist.txt');
  }

  async addRuggedToken(mint: string, reason: string, lossPercentage?: number): Promise<void> {
    if (!this.enabled) {
      return;
    }

    try {
      const tokenSymbol = await this.getTokenSymbol(mint);
      
      if (!tokenSymbol) {
        logger.warn(`Auto-blacklist: Could not retrieve symbol for mint ${mint}`);
        return;
      }

      // Controlla se già presente nella blacklist
      if (await this.isAlreadyBlacklisted(tokenSymbol)) {
        logger.debug(`Auto-blacklist: "${tokenSymbol}" already in blacklist, skipping`);
        return;
      }

      await this.appendToBlacklist(tokenSymbol, reason, lossPercentage);
      
      const lossInfo = lossPercentage ? ` (-${lossPercentage.toFixed(2)}%)` : '';
      logger.info(`🚨 AUTO-BLACKLISTED: "${tokenSymbol}" added to blacklist (reason: ${reason}${lossInfo})`);
      
    } catch (error) {
      logger.error(`Auto-blacklist: Failed to add rugged token ${mint}: ${error}`);
    }
  }

  private async getTokenSymbol(mint: string): Promise<string | null> {
    try {
      const metadataSerializer: Serializer<MetadataAccountDataArgs, MetadataAccountData> = getMetadataAccountDataSerializer();
      const metadataPDA = getPdaMetadataKey(new (require('@solana/web3.js').PublicKey)(mint));
      const metadataAccount = await this.connection.getAccountInfo(metadataPDA.publicKey, this.connection.commitment);

      if (!metadataAccount?.data) {
        return null;
      }

      const deserialize = metadataSerializer.deserialize(metadataAccount.data);
      const tokenSymbol = deserialize[0].symbol?.trim() || '';
      const tokenName = deserialize[0].name?.trim() || '';

      // Preferisci il simbolo, usa il nome come fallback
      return tokenSymbol || tokenName || null;
    } catch (error) {
      logger.error(`Auto-blacklist: Failed to get token symbol for ${mint}: ${error}`);
      return null;
    }
  }

  private async isAlreadyBlacklisted(symbol: string): Promise<boolean> {
    try {
      if (!fs.existsSync(this.symbolBlacklistFile)) {
        return false;
      }

      const content = fs.readFileSync(this.symbolBlacklistFile, 'utf-8');
      const lines = content.split('\n').map(line => line.trim().toLowerCase());
      
      return lines.some(line => {
        // Rimuovi commenti e controlla se la linea contiene il simbolo
        const cleanLine = line.split('#')[0].trim();
        return cleanLine === symbol.toLowerCase();
      });
    } catch (error) {
      logger.error(`Auto-blacklist: Failed to check if symbol is blacklisted: ${error}`);
      return false;
    }
  }

  private async appendToBlacklist(symbol: string, reason: string, lossPercentage?: number): Promise<void> {
    try {
      const timestamp = new Date().toISOString();
      const lossInfo = lossPercentage ? ` (${lossPercentage.toFixed(2)}% loss)` : '';
      const entry = `${symbol}  # AUTO-ADDED: ${reason}${lossInfo} at ${timestamp}\n`;

      // Assicurati che il file esista
      if (!fs.existsSync(this.symbolBlacklistFile)) {
        fs.writeFileSync(this.symbolBlacklistFile, '# Symbol/Name Blacklist\n');
      }

      // Aggiungi sezione auto-generated se non esiste
      const content = fs.readFileSync(this.symbolBlacklistFile, 'utf-8');
      if (!content.includes('# AUTO-ADDED RUG PULLS')) {
        const separator = '\n# AUTO-ADDED RUG PULLS (DO NOT EDIT MANUALLY)\n';
        fs.appendFileSync(this.symbolBlacklistFile, separator);
      }

      fs.appendFileSync(this.symbolBlacklistFile, entry);
      logger.debug(`Auto-blacklist: Added "${symbol}" to blacklist file`);
    } catch (error) {
      logger.error(`Auto-blacklist: Failed to append to blacklist: ${error}`);
    }
  }
} 