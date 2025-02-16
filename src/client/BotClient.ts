import {AbstractClient} from "../base/AbstractClient";
import {Context, session, Telegraf} from "telegraf";
import {ConfigEnv} from "../config/Config";
import BotHelper from "../service/BotHelper";
import {SendMessage} from "../base/IMessage";
import {ClientEnum, getClientByEnum} from "../constant/ClientConstants";
import PrismaService from "../service/PrismaService";
import TgClient from "./TgClient";
import {WxClient} from "./WxClient";
import {LogUtils} from "../util/LogUtils";
import {defaultSetting} from "../util/SettingUtils";

export default class BotClient extends AbstractClient<Telegraf> {

    private constructor() {
        super();
        this.bot = new Telegraf(ConfigEnv.BOT_TOKEN)
        this.bot.use(session({defaultSession: () => ({})}))
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

    public async start() {
        return new Promise((resolve, reject) => {
            this.login().then(() => {
                TgClient.getInstance().login().then(() => {
                    WxClient.getInstance().login().then(() => {
                        resolve(true);
                    }).catch(reject);
                }).catch(reject);
            }).catch(reject);
        });
    }

    login(): Promise<boolean> {
        return new Promise<boolean>((resolve, reject) => {
            this.initBot()
            this.bot.launch(() => {
                this.hasLogin = true

                const prismaService = PrismaService.getInstance(PrismaService);
                prismaService.getConfigByToken().then(config => {
                    if (!config.tg_login) {
                        this.bot.telegram.sendMessage(Number(config.bot_chat_id), `请先输入 /start，然后按照提示登录 Telegram`)
                    }
                    if (!config.login_wxid) {
                        this.bot.telegram.sendMessage(Number(config.bot_chat_id), `请使用命令 /login 登录微信`)
                    }
                    if (!config.setting) {
                        prismaService.config().update({
                            where: {id: config.id},
                            data: {
                                setting: defaultSetting
                            }
                        }).then()
                    }
                    resolve(true)
                })


            }).then(() => {

            }).catch((e) => {
                this.hasLogin = false
                reject(e)
            })
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

    async sendMessage(msg: SendMessage): Promise<Record<string, any>> {
        // 默认发送到 bot_chat_id
        const prismaService = PrismaService.getInstance(PrismaService);
        if (!msg.chatId) {
            msg.chatId = Number((await prismaService.getConfigByToken()).bot_chat_id)
        }
        return new Promise<object>((resolve, reject) => {
            let result = null
            const telegram = this.bot.telegram;
            if (msg.title && !msg.title?.endsWith('\n')) {
                msg.title += '\n'
            } else {
                msg.title = ''
            }
            let text = msg.title ? msg.title + msg.content : msg.content
            switch (msg.msgType) {
                case "quote":
                    const content = msg.parentId ? msg.ext?.title
                        : `<blockquote>${msg.ext?.referMsg_title}</blockquote>&#10;${msg.ext?.title}`
                    result = telegram.sendMessage(msg.chatId, msg.title + content, {
                        parse_mode: 'HTML',
                        reply_parameters: msg.parentId ? {
                            message_id: msg.replyId
                        } : undefined
                    })
                    break;
                case "text":
                    result = telegram.sendMessage(msg.chatId, text, msg.ext)
                    break;
                case "image":
                    result = telegram.sendPhoto(msg.chatId, {source: msg.file}, msg.ext)
                    break;
                case "audio":
                    result = telegram.sendAudio(msg.chatId, {source: msg.file}, msg.ext)
                    break;
                case "video":
                    result = telegram.sendVideo(msg.chatId, {source: msg.file}, msg.ext)
                    break;
                case "file":
                    result = telegram.sendDocument(msg.chatId, {source: msg.file}, msg.ext)
                    break;
                case "location":
                    if (!msg.ext.latitude || !msg.ext.longitude) {
                        reject('location message must have ext')
                    }
                    result = telegram.sendLocation(msg.chatId, msg.ext.latitude, msg.ext.longitude)
                    break;
                case "redPacket":
                    if (!msg.file) {
                        result = telegram.sendMessage(msg.chatId, text, msg.ext)
                    } else {
                        result = telegram.sendPhoto(msg.chatId, {source: msg.file}, {
                            caption: text,
                        })
                    }
                    break;
                default:
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
        botHelper.filterOwner(this.bot)
        botHelper.setCommands(this.bot)
        botHelper.onCommand(this.bot)
        this.bot.catch((err, ctx: Context) => {
            this.logError('BotClient catch error : %s', err)
        })
    }

}