import {AbstractClient} from "../base/AbstractClient";
import {SendMessage} from "../base/IMessage";
import os from "node:os";
import {TelegramClient} from 'telegram/client/TelegramClient'
import {StoreSession} from "telegram/sessions";
import {ConfigEnv} from "../config/Config";
import {ClientEnum, getClientByEnum} from "../constant/ClientConstants";
import BotClient from "./BotClient";
import PrismaService from "../service/PrismaService";
import {Telegraf} from "telegraf";
import {message} from "telegraf/filters";
import QRCode from "qrcode";
import {Api} from "telegram";


export default class TgClient extends AbstractClient<TelegramClient> {
    public static DEFAULT_FILTER_ID: number = 116
    public static DIALOG_TITLE: string = 'WeChat'

    private constructor() {
        super();
        this.bot = new TelegramClient(new StoreSession('storage/tg-user-session'),
            ConfigEnv.API_ID,
            ConfigEnv.API_HASH, {
                connectionRetries: 100000,
                deviceModel: `wx2tg User On ${os.hostname()}`,
                appVersion: 'rainbowcat',
                proxy: ConfigEnv.PROXY_CONFIG.hasProxy ? {
                    ip: ConfigEnv.PROXY_CONFIG.host,
                    socksType: 5,
                    ...ConfigEnv.PROXY_CONFIG
                } : undefined,
                autoReconnect: true,
                maxConcurrentDownloads: 3,
            })
    }

    static getInstance(): TgClient {
        if (this.instance == null) {
            this.instance = new TgClient();
            (this.instance as TgClient).initialize()
        }
        return this.instance as TgClient;
    }

    private initialize(): void {
        this.spyClients.set(ClientEnum.TG_BOT, getClientByEnum(ClientEnum.TG_BOT));

        if (this.hasLogin) {
            this.setupFolder()
        }

    }

    async login(): Promise<boolean> {
        const botClient = this.spyClients.get(ClientEnum.TG_BOT) as BotClient
        const tgBot = botClient.bot as Telegraf;
        const prisma = PrismaService.getInstance(PrismaService)
        return new Promise((resolve, reject) => {
            this.bot.connect().then(async () => {
                let tgScanMsgId = 0
                const config = await prisma.getConfigByToken()
                const user = await this.bot.signInUserWithQrCode({apiId: ConfigEnv.API_ID, apiHash: ConfigEnv.API_HASH},
                    {
                        onError: (e) => {
                            if (e) {
                                tgBot.telegram.sendMessage(Number(config.bot_chat_id), `登录失败：${e}`)
                            }
                        },
                        password: async (hint) => {
                            return new Promise<string>(resolve => {
                                tgBot.telegram.sendMessage(Number(config.bot_chat_id),
                                    `请回复这条消息，输入二步验证码，密码提示：${hint}`)
                                    .then(res => {
                                        tgBot.on(message('reply_to_message'), (ctx) => {
                                            const password = ctx.text.trim();
                                            resolve(password)
                                        })
                                    })
                            })
                        },
                        qrCode: async (code) => {
                            // console.log(`tg://login?token=${code.token.toString("base64url")}`);
                            QRCode.toBuffer(`tg://login?token=${code.token.toString("base64url")}`, {
                                width: 150
                            }, (error, buffer) => {
                                tgBot.telegram.sendPhoto(Number(config.bot_chat_id),
                                    {source: buffer},
                                    {caption: '请使用 Telegram 扫码登录'})
                                    .then((res) => {
                                        tgScanMsgId = res.message_id
                                    })
                            })
                        },
                    })
                if (user) {
                    tgBot.telegram.editMessageCaption(Number(config.bot_chat_id),
                        tgScanMsgId, undefined,
                        'TG 登录成功').then(() => {
                        prisma.config().updateMany({
                            where: {bot_token: ConfigEnv.BOT_TOKEN},
                            data: {tg_login: true}
                        })
                        this.hasLogin = true
                        resolve(true)
                    })
                } else {
                    reject(false)
                }
            })
        })

    }

    logout(): Promise<boolean> {
        throw new Error("Method not implemented.");
    }

    sendMessage(msgParams: SendMessage): Promise<object> {
        throw new Error("Method not implemented.");
    }

    onMessage(any: any): void {
        throw new Error("Method not implemented.");
    }

    public setupFolder() {
        this.bot?.invoke(new Api.messages.GetDialogFilters()).then(dialogRes => {
            const dialogFilterIdList = dialogRes?.filters?.map(it => {
                return it instanceof Api.DialogFilter ? it.id : 0
            })

            const wxDialog = dialogRes?.filters?.find(it => it instanceof Api.DialogFilter && it.title === TgClient.DIALOG_TITLE)

            if (!wxDialog) {
                const dialogId = Math.max(...dialogFilterIdList) + 1 || TgClient.DEFAULT_FILTER_ID
                const botClient = this.spyClients.get(ClientEnum.TG_BOT) as BotClient;
                this.bot?.getInputEntity(botClient.bot.botInfo.id).then(botEntity => {
                    const dialogFilter = new Api.DialogFilter({
                        id: dialogId,
                        title: TgClient.DIALOG_TITLE,
                        pinnedPeers: [botEntity],
                        includePeers: [botEntity],
                        excludePeers: [],
                    })
                    this.bot?.invoke(new Api.messages.UpdateDialogFilter({
                        id: dialogId,
                        filter: dialogFilter,
                    })).catch(e => {
                        if (e.errorMessage.includes('DIALOG_FILTERS_TOO_MUCH')) {
                            botClient.sendMessage({
                                msgType: 'text',
                                content: '已经到达文件夹创建的上限，不能再创建新的文件夹'
                            })
                            return
                        }
                    })
                })
            }
        })
    }

}