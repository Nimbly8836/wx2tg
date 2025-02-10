import {AbstractClient} from "../base/AbstractClient";
import {Context, session, Telegraf} from "telegraf";
import {ConfigEnv} from "../config/Config";
import BotHelper from "../service/BotHelper";
import {SendMessage} from "../base/IMessage";
import {ClientEnum, getClientByEnum} from "../constant/ClientConstants";
import PrismaService from "../service/PrismaService";

export default class BotClient extends AbstractClient<Telegraf> {

    private constructor() {
        super();
        this.bot = new Telegraf(ConfigEnv.BOT_TOKEN)
        this.bot.use(session())
    }

    static getInstance(): BotClient {
        if (this.instance == null) {
            this.instance = new BotClient();
            (this.instance as BotClient).initialize()
        }
        return this.instance as BotClient;
    }

    private initialize(): void {
        this.spyClients.set(ClientEnum.WX_BOT, getClientByEnum(ClientEnum.WX_BOT));

    }


    login(): Promise<boolean> {
        return new Promise<boolean>((resolve, reject) => {
            this.hasLogin = true
            this.initBot()
            this.bot.launch().then(() => {
                PrismaService.getInstance(PrismaService).getConfigByToken().then(config => {
                    if (!config.tg_login) {
                        this.bot.telegram.sendMessage(Number(config.bot_chat_id), `请先输入 /start，然后按照提示登录 Telegram`)
                    }
                    if (!config.login_wxid) {
                        this.bot.telegram.sendMessage(Number(config.bot_chat_id), `请使用命令 /login 登录微信`)
                    }
                })
            }).catch((e) => {
                this.logError('BotClient start error : %s', e)
            })
            // this.bot.start()
        })
    }

    logout(): Promise<boolean> {
        return new Promise<boolean>((resolve, reject) => {
            try {
                this.bot.stop('SIGINT')
                this.hasLogin = false;
                resolve(true);
            } catch (error) {
                reject(error);
            }
        })
    }

    async sendMessage(msg: SendMessage): Promise<object> {
        // 默认发送到 bot_chat_id
        if (!msg.chatId) {
            msg.chatId = Number((await PrismaService.getInstance(PrismaService).getConfigByToken()).bot_chat_id)
        }
        return new Promise<object>((resolve, reject) => {
            let result = null
            switch (msg.msgType) {
                case "text":
                    result = this.bot.telegram.sendMessage(msg.chatId, msg.content, msg.ext)
                    break;
                case "image":
                    result = this.bot.telegram.sendPhoto(msg.chatId, {source: msg.file}, msg.ext)
                    break;
                case "audio":
                    break;
                case "video":
                    break;
                case "file":
                    break;
                case "location":
                    break;
                case "link":
                    break;
                case "event":
                    break;
            }
            resolve(result)
        })
    }

    onMessage(any: any): void {

    }

    private initBot(): void {
        // 设置命令
        const botHelper = BotHelper.getInstance(BotHelper);
        botHelper.setCommands(this.bot)
        botHelper.onCommand(this.bot)
        this.bot.catch((err, ctx: Context) => {
            this.logError('BotClient catch error : %s', err)
        })
    }

    public start(): void {

    }

}