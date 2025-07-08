import axios, { AxiosInstance, AxiosResponse } from 'axios';

// Tipi per le API di Solscan
interface TokenActivity {
  trans_id: string;
  block_time: number;
  from_address: string;
  program_id: string;
  activity_type: string;
  token_changes: TokenChange[];
  source?: string;
}

interface TokenChange {
  token_address: string;
  amount: string;
  decimals: number;
  change_type?: string;
  symbol?: string;
}

interface SolscanResponse {
  data: TokenActivity[];
  total?: number;
}

interface LiquidityData {
  signature: string;
  timestamp: Date;
  fromAddress: string;
  solAmount: number;
  tokenAmount: number;
  usdcValue?: number;
}

class SolscanAPIClient {
  private readonly apiClient: AxiosInstance;
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    
    this.apiClient = axios.create({
      baseURL: 'https://api.solscan.io/v2',
      timeout: 15000,
      headers: {
        'token': apiKey,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
  }

  /**
   * Ottieni le attività DeFi per un token
   */
  async getTokenActivities(
    tokenAddress: string, 
    activityTypes: string[] = ['ACTIVITY_TOKEN_ADD_LIQUIDITY'],
    limit: number = 50
  ): Promise<TokenActivity[]> {
    try {
      console.log(`🔍 Recupero attività per token: ${tokenAddress}`);
      console.log(`🔗 URL: ${this.apiClient.defaults.baseURL}/account/defi/activities`);
      console.log(`🔑 Headers:`, this.apiClient.defaults.headers);
      
      const response: AxiosResponse<SolscanResponse> = await this.apiClient.get(
        '/account/defi/activities',
        {
          params: {
            address: tokenAddress,
            activity_type: activityTypes.join(','),
            limit,
            offset: 0
          }
        }
      );

      console.log(`✅ Trovate ${response.data.data?.length || 0} attività`);
      return response.data.data || [];
    } catch (error) {
      console.error('❌ Errore nell\'API call:', this.formatError(error));
      
      // Proviamo endpoint alternativi
      console.log('🔄 Tentativo con endpoint alternativo...');
      try {
        const altResponse = await this.apiClient.get(`/account/token/txs`, {
          params: {
            address: tokenAddress,
            limit: 10
          }
        });
        console.log('✅ Endpoint alternativo funziona:', altResponse.status);
        return [];
      } catch (altError) {
        console.error('❌ Anche endpoint alternativo fallito:', this.formatError(altError));
        return [];
      }
    }
  }

  /**
   * Estrai le aggiunte di liquidità con i valori USDC
   */
  async extractInitialLiquidityValue(tokenAddress: string): Promise<number | null> {
    try {
      const activities = await this.getTokenActivities(tokenAddress);
      
      if (activities.length === 0) {
        console.log('⚠️ Nessuna attività trovata per questo token');
        return null;
      }

      // Trova la prima aggiunta di liquidità (più recente)
      const liquidityActivity = activities.find(
        activity => activity.activity_type === 'ACTIVITY_TOKEN_ADD_LIQUIDITY'
      );

      if (!liquidityActivity) {
        console.log('⚠️ Nessuna aggiunta di liquidità trovata');
        return null;
      }

      console.log('🔍 Analizzando attività di liquidità...');
      console.log(`Signature: ${liquidityActivity.trans_id}`);
      console.log(`Timestamp: ${new Date(liquidityActivity.block_time * 1000).toISOString()}`);

      // Analizza i cambiamenti dei token
      const tokenChanges = liquidityActivity.token_changes || [];
      console.log(`📊 Token changes trovati: ${tokenChanges.length}`);

      let solAmount = 0;
      let usdcAmount = 0;

      for (const change of tokenChanges) {
        const amount = parseFloat(change.amount) / Math.pow(10, change.decimals);
        
        console.log(`Token: ${change.token_address}`);
        console.log(`Amount: ${amount}`);
        console.log(`Symbol: ${change.symbol || 'Unknown'}`);
        console.log(`Decimals: ${change.decimals}`);
        console.log('---');

        // Identifica SOL/WSOL (Wrapped SOL)
        if (change.token_address === 'So11111111111111111111111111111111111111112' || 
            change.symbol === 'WSOL' || 
            change.symbol === 'SOL') {
          solAmount = Math.abs(amount);
        }

        // Identifica USDC
        if (change.token_address === 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' || 
            change.symbol === 'USDC') {
          usdcAmount = Math.abs(amount);
        }
      }

      if (usdcAmount > 0) {
        console.log(`💰 Valore USDC iniziale trovato: $${usdcAmount.toFixed(2)}`);
        return usdcAmount;
      } else if (solAmount > 0) {
        // Se non c'è USDC, stima il valore basato su SOL
        const estimatedUsdcValue = solAmount * 240; // Prezzo SOL approssimativo
        console.log(`💰 Valore stimato basato su SOL: $${estimatedUsdcValue.toFixed(2)} (${solAmount} SOL)`);
        return estimatedUsdcValue;
      }

      console.log('❌ Nessun valore USDC o SOL significativo trovato');
      return null;

    } catch (error) {
      console.error('❌ Errore nell\'estrazione del valore di liquidità:', this.formatError(error));
      return null;
    }
  }

  /**
   * Monitora nuove aggiunte di liquidità
   */
  async monitorToken(
    tokenAddress: string, 
    callback: (liquidityData: LiquidityData) => void,
    intervalMs: number = 30000
  ): Promise<void> {
    const seenSignatures = new Set<string>();
    
    console.log(`🚀 Avvio monitoraggio per token: ${tokenAddress}`);
    console.log(`⏰ Intervallo di controllo: ${intervalMs / 1000} secondi`);

    const check = async () => {
      try {
        const activities = await this.getTokenActivities(tokenAddress);
        
        for (const activity of activities) {
          if (activity.activity_type === 'ACTIVITY_TOKEN_ADD_LIQUIDITY' && 
              !seenSignatures.has(activity.trans_id)) {
            
            seenSignatures.add(activity.trans_id);
            
            // Estrai i dati di liquidità
            const liquidityData = this.parseLiquidityActivity(activity);
            
            if (liquidityData) {
              console.log('🔥 NUOVA LIQUIDITÀ RILEVATA!');
              console.log(`💳 Signature: ${liquidityData.signature}`);
              console.log(`💰 Valore: ~$${liquidityData.usdcValue?.toFixed(2) || 'N/A'}`);
              console.log(`🏦 Da: ${liquidityData.fromAddress}`);
              console.log('─'.repeat(50));
              
              callback(liquidityData);
            }
          }
        }
      } catch (error) {
        console.error('❌ Errore durante il monitoraggio:', this.formatError(error));
      }
    };

    // Primo check immediato
    await check();

    // Setup intervallo
    setInterval(check, intervalMs);
  }

  private parseLiquidityActivity(activity: TokenActivity): LiquidityData | null {
    try {
      let solAmount = 0;
      let usdcAmount = 0;
      let tokenAmount = 0;

      for (const change of activity.token_changes || []) {
        const amount = parseFloat(change.amount) / Math.pow(10, change.decimals);
        
        if (change.token_address === 'So11111111111111111111111111111111111111112' || 
            change.symbol === 'WSOL' || change.symbol === 'SOL') {
          solAmount = Math.abs(amount);
        } else if (change.token_address === 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' || 
                   change.symbol === 'USDC') {
          usdcAmount = Math.abs(amount);
        } else {
          tokenAmount = Math.abs(amount);
        }
      }

      const estimatedUsdcValue = usdcAmount > 0 ? usdcAmount : solAmount * 240;

      return {
        signature: activity.trans_id,
        timestamp: new Date(activity.block_time * 1000),
        fromAddress: activity.from_address,
        solAmount,
        tokenAmount,
        usdcValue: estimatedUsdcValue
      };
    } catch (error) {
      console.error('Errore nel parsing dell\'attività:', error);
      return null;
    }
  }

  private formatError(error: any): string {
    if (error.response) {
      return `HTTP ${error.response.status}: ${error.response.data?.message || error.response.statusText}`;
    } else if (error.request) {
      return 'Nessuna risposta dal server';
    } else {
      return error.message || String(error);
    }
  }
}

// Esempio di utilizzo
async function testSolscanAPI() {
  // La tua chiave API
  const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJjcmVhdGVkQXQiOjE3NDQ4MjI2NDg3NDYsImVtYWlsIjoidmFuemluaWQ5OEBnbWFpbC5jb20iLCJhY3Rpb24iOiJ0b2tlbi1hcGkiLCJhcGlWZXJzaW9uIjoidjIiLCJpYXQiOjE3NDQ4MjI2NDh9.Fw1KR30o1_hOyFjIDJTAUzpuiktZalF6TIjeA6mVkHU';
  
  // Esempio di token address - usiamo un token con liquidità recente
  const TOKEN_ADDRESS = '72sdpjJTfsjP4PZdG7zuA35qongHT5LQTqTu1WmsktC9'; // Token che aveva liquidità recente dal log
  
  const client = new SolscanAPIClient(API_KEY);

  try {
    console.log('🔬 Test estrazione valore liquidità iniziale...');
    const liquidityValue = await client.extractInitialLiquidityValue(TOKEN_ADDRESS);
    
    if (liquidityValue !== null) {
      console.log(`\n🎯 RISULTATO: Liquidità iniziale = $${liquidityValue.toFixed(2)}`);
    } else {
      console.log('\n❌ Impossibile determinare il valore di liquidità iniziale');
    }

    // Test monitoraggio (decommenta per testare)
    /*
    console.log('\n🔄 Avvio monitoraggio...');
    await client.monitorToken(TOKEN_ADDRESS, (liquidityData) => {
      if (liquidityData.usdcValue && liquidityData.usdcValue > 1000) {
        console.log('🚨 ALERT: Liquidità significativa rilevata!');
        // Qui puoi aggiungere la logica del tuo bot
      }
    });
    */

  } catch (error) {
    console.error('❌ Errore nel test:', error);
  }
}

// Esporta le classi per uso esterno
export { SolscanAPIClient, type LiquidityData, type TokenActivity };

// Esegui il test
if (require.main === module) {
  testSolscanAPI().catch(console.error);
} 