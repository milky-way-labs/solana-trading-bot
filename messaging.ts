import {Telegraf} from "telegraf";
import {InlineKeyboardMarkup, Message} from "telegraf/typings/core/types/typegram";
import {BotConfig} from "./bot";
import {logger} from "./helpers/logger";

export class Messaging {
    private readonly tg_bot?: Telegraf;

    constructor(readonly config: BotConfig) {

        if (this.config.useTelegram) {
            if (!this.config.telegramBotToken) {
                throw new Error('TELEGRAM_BOT_TOKEN is required when USE_TELEGRAM is true');
            }
            if (!this.config.telegramChatId) {
                throw new Error('TELEGRAM_CHAT_ID is required when USE_TELEGRAM is true');
            }
            
            this.tg_bot = new Telegraf(this.config.telegramBotToken);
            this.setupBot();
            this.tg_bot.launch().catch((error) => {
                if (error.message.includes('409') || error.message.includes('Conflict')) {
                    logger.warn('⚠️ Telegram bot conflict detected - another instance might be running. Retrying in 10 seconds...');
                    setTimeout(() => {
                        this.tg_bot?.launch().catch((retryError) => {
                            logger.error('Failed to restart Telegram bot after conflict:', retryError.message);
                        });
                    }, 10000);
                } else {
                    logger.error('Failed to launch Telegram bot:', error.message);
                }
            });
        }
    }

    private setupBot() {
        if (!this.tg_bot) return;
        
        this.tg_bot.on("message", async (ctx) => {
            if (!this.checkChatId(ctx)) {
                return;
            }

            if (ctx.text?.toLowerCase().includes("/status")) {
                ctx.reply("Working", {parse_mode: "HTML"});
            }

            if (ctx.text?.toLowerCase().includes("/config")) {
                ctx.reply(this.objectToText(this.config, ["wallet", "telegramBotToken", "telegramChatId", "telegramThreadId"]), {parse_mode: "HTML"});
            }

            if (ctx.text?.toLowerCase().includes("/help")) {
                let kb: InlineKeyboardMarkup = {
                    inline_keyboard: [
                        [
                            {text: 'status', switch_inline_query_current_chat: `/status`},
                            {text: 'config', switch_inline_query_current_chat: `/config`},
                            {text: 'logs', switch_inline_query_current_chat: `/logs`}
                        ]
                    ]
                };

                ctx.reply("Available commands", {parse_mode: "HTML", reply_markup: kb});
            }

            //unstable
            // if(ctx.text?.toLowerCase().includes("/logs")){
            //   const linesOfLog = 150;
            //   const logFilePath = "./logs/activity.log";
            //   fs.readFile(logFilePath, 'utf8', (err, data) => {
            //     if (err) {
            //       ctx.reply(`Error reading log file: ${err.message}`, { parse_mode: "HTML" });
            //     } else {
            //       const lines = data.trim().split(/\r?\n/);
            //       const lastLines = lines.slice(Math.max(lines.length - linesOfLog, 0)).join('\n');
            //       const message = `${lastLines}`;
            //       const chunks = message.match(/[\s\S]{1,4084}/g) || [];
            //       chunks.forEach((chunk) => {
            //         ctx.reply(`<code>${chunk}</code>`, { parse_mode: "HTML" });
            //       });
            //     }
            //   });
            // }
        });
    }

    private checkChatId(ctx: any): boolean {
        if (
            ctx.chat?.id !== this.config.telegramChatId
            || (this.config.telegramThreadId && ctx.message.message_thread_id !== this.config.telegramThreadId)
        ) {
            ctx.reply("fuck off");
            return false;
        }
        return true;
    }

    private objectToText(obj: object, excludeKeys: string[]): string {
        let result = '';
        for (const key in obj) {
            if (obj.hasOwnProperty(key) && !excludeKeys.includes(key)) {
                let value = obj[key];
                if (typeof value === 'object' && value !== null) {
                    continue;
                }
                result += `${key}: <code>${value}</code>\n`;
            }
        }
        return result;
    }

    public async sendTelegramMessage(message: string, mint: string, messageId?: number): Promise<Message.TextMessage | undefined> {
        if (!this.config.useTelegram || !this.tg_bot) {
            return undefined;
        }

        try {
            let kb: InlineKeyboardMarkup = {
                inline_keyboard: [
                    [
                        {
                            text: '🍔Dexscreener',
                            url: `https://dexscreener.com/solana/${mint}?maker=${this.config.wallet.publicKey}`
                        },
                        {text: 'Rugcheck🔍', url: `https://rugcheck.xyz/tokens/${mint}`}
                    ]
                ]
            };

            if (messageId) {
                await this.tg_bot.telegram.editMessageText(this.config.telegramChatId, messageId, undefined, message, {
                    parse_mode: "HTML", reply_markup: kb
                });
                return undefined;

            } else {
                return await this.tg_bot.telegram.sendMessage(this.config.telegramChatId, message, {
                    message_thread_id: this.config.telegramThreadId ? this.config.telegramThreadId : undefined,
                    parse_mode: "HTML",
                    reply_markup: kb
                });
            }

        } catch (e) {
            return undefined;
        }
    }
}