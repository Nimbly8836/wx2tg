import {AbstractClient} from "../base/AbstractClient";
import {SendMessage} from "../base/IMessage";
import os from "node:os";
import {TelegramClient} from 'telegram/client/TelegramClient'
import {StoreSession} from "telegram/sessions";
import {ConfigEnv} from "../config/Config";
import BotClient from "./BotClient";
import PrismaService from "../service/PrismaService";
import {message} from "telegraf/filters";
import {Api} from "telegram";
import {NewMessage} from "telegram/events";
import {groupIds, initGroupIds} from "../util/CacheUtils";
import {MessageService} from "../service/MessageService";
import QRCode from "qrcode";
import {Constants} from "../constant/Constants";
import {DeletedMessage, DeletedMessageEvent} from "telegram/events/DeletedMessage";
import {revoke} from "../util/GewePostUtils";
import {autoInjectable, container, delay, inject, singleton} from "tsyringe";
import {ClientEnum} from "../constant/ClientConstants";



@singleton()
export default class TgClient extends AbstractClient<TelegramClient> {
    public static readonly DEFAULT_FILTER_ID: number = 116
    public static readonly DIALOG_TITLE: string = 'WeChat'
    public waitingReplyOnLogin = []


    constructor(
        @inject(delay(() => PrismaService)) readonly prismaService: PrismaService,
        @inject(delay(() => BotClient)) readonly botClient: BotClient) {
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

    async login(): Promise<boolean> {

        if (this.hasLogin) {
            this.setupFolder()
        }

        // 设置需要监听的群组id
        initGroupIds()

        const tgBot = this.botClient.bot;
        const prisma = this.prismaService
        return new Promise((resolve, reject) => {
            this.bot.connect().then(async () => {
                const b = await this.bot.checkAuthorization();
                if (b) {
                    prisma.config().updateMany({
                        where: {bot_token: ConfigEnv.BOT_TOKEN},
                        data: {tg_login: true}
                    }).then()
                    this.hasLogin = true
                    this.setEvenHandler()
                    resolve(true)
                    return
                }
                const waitInput = (textMsg: string) => {
                    return new Promise<string>(resolve => {
                        tgBot.telegram.sendMessage(Number(config.bot_chat_id),
                            `${textMsg}`)
                            .then(res => {
                                this.waitingReplyOnLogin.push(res.message_id)
                                tgBot.on(message('reply_to_message'), (ctx, next) => {
                                    this.logDebug('login on reply_to_message', ctx)
                                    const input = ctx.text.trim();
                                    this.waitingReplyOnLogin.push(ctx.message.message_id)
                                    resolve(input)
                                    return next()
                                })
                            })
                    })
                }
                const config = await prisma.getConfigByToken()
                const chatId = Number(config.bot_chat_id);
                this.bot.signInUserWithQrCode({
                    apiId: ConfigEnv.API_ID,
                    apiHash: ConfigEnv.API_HASH,
                }, {
                    onError: (e) => {
                        if (e) {
                            tgBot.telegram.sendMessage(chatId, `登录失败：${e}`).then(res => {
                                this.waitingReplyOnLogin.push(res.message_id)
                            })
                        }
                    },
                    qrCode: async (code) => {
                        const qrcode = `tg://login?token=${code.token.toString("base64url")}`
                        QRCode.toBuffer(qrcode, {
                            width: 150
                        }, (error, buffer) => {
                            if (!error) {
                                tgBot.telegram.sendPhoto(chatId, {source: buffer}, {
                                    caption: '请使用手机 TG 扫码登录'
                                }).then(res => {
                                    this.waitingReplyOnLogin.push(res.message_id)
                                })
                            }
                        })
                    },
                    password: (hint) => {
                        return waitInput(`请回复这条消息，输入二步验证码，密码提示：${hint}`)
                    }
                }).then(() => {
                    // 删除消息
                    tgBot.telegram.deleteMessages(Number(config.bot_chat_id),
                        this.waitingReplyOnLogin)
                    tgBot.telegram.sendMessage(Number(config.bot_chat_id),
                        'TG 登录成功',
                    ).then(() => {
                        prisma.config().updateMany({
                            where: {bot_token: ConfigEnv.BOT_TOKEN},
                            data: {tg_login: true}
                        }).then()
                        this.hasLogin = true
                        resolve(true)
                    })
                    this.setEvenHandler()
                })
            })
        })

    }

    logout(): Promise<boolean> {
        throw new Error("Method not implemented.");
    }

    sendMessage(msgParams: SendMessage): Promise<Record<string, any>> {
        return new Promise((resolve, reject) => {
            const msgType = msgParams.msgType;
            switch (msgType) {
                case "file":
                    this.bot.sendFile(msgParams.chatId,
                        {
                            file: msgParams.file + '/' + msgParams.fileName,
                        }
                    ).then(resolve).catch(reject)
                    break;
                case "video":

            }
        })
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
                const botClient = this.botClient
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
                        }
                    })
                })
            }
        })
    }

    private setEvenHandler() {
        const messageService = container.resolve(MessageService);

        if (this.bot.connected) {
            // 监听所有接收的消息
            this.bot.addEventHandler(event => {
                if (groupIds.has(event.chatId?.toJSNumber())) {
                    this.prismaService.getConfigCurrentLoginWxAndToken().then(config => {
                        this.prismaService.prisma.group.findUnique({
                            where: {
                                tg_group_id: event.chatId?.toJSNumber(),
                                config_id: config.id,
                            }
                        }).then(async group => {
                            if (!group) {
                                return
                            }
                            // 判断是否允许转发
                            const allowIds = group?.allow_ids || [];
                            // 转发所有人的，除了 id 是负的
                            let forward = true
                            // 自己部署的机器人的消息不转发
                            const config = await this.prismaService.getConfigByToken()
                            if (event.message.fromId instanceof Api.PeerUser) {
                                if (Number(config.bot_id) == event.message.fromId?.userId?.toJSNumber()) {
                                    forward = false
                                }
                            }
                            if (allowIds.includes(BigInt(1))) {
                                if (event.message.fromId instanceof Api.PeerUser) {
                                    const disableIdWhenAll = -(event.message.fromId?.userId?.toJSNumber())
                                    if (allowIds.includes(BigInt(disableIdWhenAll))) {
                                        forward = false
                                    }
                                }

                            } else { // 只转发指定的
                                if (event.message.fromId instanceof Api.PeerUser) {
                                    const checkId = event.message.fromId?.userId?.toJSNumber()
                                    if (!allowIds.includes(BigInt(checkId))) {
                                        forward = false
                                    }
                                }
                            }
                            // 处理转发的消息
                            if (forward) {
                                messageService.addMessages({
                                    msgType: 'text',
                                    chatId: event.chatId?.toJSNumber(),
                                    content: event.message.text,
                                }, ClientEnum.WX_BOT)

                                if (event.message.media) {
                                    const mimeTypeSplit = event.message.file.mimeType?.split('/');
                                    const notNamedFile = `${event.chatId}-${event.message.id}-${mimeTypeSplit?.[0]}.${mimeTypeSplit?.[1]}`
                                    const fileName = event.message.file.name || notNamedFile
                                    const outputFile = Constants.GEWE_UPLOAD_PATH + '/' + fileName;
                                    event.message.downloadMedia({
                                        outputFile: outputFile,
                                    }).then(async media => {
                                        messageService.addMessages({
                                            content: "",
                                            msgType: mimeTypeSplit?.[0] === 'image' ? 'image' : 'file',
                                            chatId: event.chatId?.toJSNumber(),
                                            file: outputFile,
                                            fileName: fileName,
                                        }, ClientEnum.WX_BOT)
                                    })
                                }
                            }
                        })
                    })
                }
            }, new NewMessage({
                incoming: true,
                forwards: true,
            }))

            // 删除消息撤回
            this.bot.addEventHandler(event => {
                this.prismaService.prisma.group.findUnique({
                    where: {
                        tg_group_id: event.chatId?.toJSNumber(),
                    }
                }).then(async group => {
                    if (group) {
                        this.prismaService.prisma.message.findFirst({
                            where: {
                                group_id: group.id,
                                tg_msg_id: event._messageId,
                            }
                        }).then(async message => {
                            revoke({
                                toWxid: group.wx_id,
                                msgId: message.msg_id,
                                newMsgId: message.wx_msg_id,
                                createTime: message.wx_msg_create,
                            }).then(r => {
                                // @ts-ignore
                                if (r.ret === 200) {
                                    this.prismaService.prisma.message.update({
                                        where: {
                                            id: message.id,
                                        },
                                        data: {
                                            is_deleted: 1
                                        }
                                    }).then()

                                }
                            })
                        })
                    }
                })
            }, new DeletedMessage({
                func: (event: DeletedMessageEvent) => {
                    return groupIds.has(event.chatId?.toJSNumber())
                }
            }))
        }
    }

}