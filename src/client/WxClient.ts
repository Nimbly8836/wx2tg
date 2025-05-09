import {AbstractClient} from "../base/AbstractClient";
import {Contact, ContactSelf, Filebox, GeweBot, Room} from "gewechaty";
import {ConfigEnv} from "../config/Config";
import QRCode from 'qrcode'
import PrismaService from "../service/PrismaService";
import BotClient from "../client/BotClient";
import {Constants} from "../constant/Constants";
import {SendMessage} from "../base/IMessage";
import {defaultSetting} from "../util/SettingUtils";
import {parseRevokeMsgPayload} from "../util/MessageUtils";
import {Markup} from "telegraf";
import fs from "node:fs";
import {getBaseHttpAddress} from "../util/Gewechaty";
import {quote} from "../util/GewePostUtils";
import {delay, inject, singleton} from "tsyringe";
import {randomUUID} from "node:crypto";
import {WxMessageHelper} from "../service/WxMessageHelper";
import {getService} from "../di";

@singleton()
export class WxClient extends AbstractClient<GeweBot> {

    private scanPhotoMsgId: number[] = []

    private readonly cid: string;

    public me: ContactSelf
    public friendshipList = []

    private wxMessageHelper: WxMessageHelper;

    constructor(@inject(delay(() => PrismaService)) readonly prismaService: PrismaService,
                @inject(delay(() => BotClient)) readonly botClient: BotClient) {
        super();
        this.cid = randomUUID().toString()
        this.bot = new GeweBot({
            base_api: ConfigEnv.BASE_API,
            file_api: ConfigEnv.FILE_API,
            port: ConfigEnv.GEWE_PORT,
            static: ConfigEnv.GEWE_STATIC,
            proxy: ConfigEnv.GEWE_PROXY,
            // debug: false,
            cache_path: 'storage/gewe',
            ip: ConfigEnv.GEWE_IP,
        })
        this.wxMessageHelper = getService(WxMessageHelper);
    }

    private loginTime: number = 0

    login(): Promise<boolean> {
        // 发送文件需要的路径 暂时写死, 不改 ge_wechaty
        const path = Constants.GEWE_UPLOAD_PATH;
        if (!fs.existsSync(path)) {
            fs.mkdirSync(path, {recursive: true})
        }
        // gewe 文件需要的路径
        if (!fs.existsSync(Constants.GEWE_PATH)) {
            fs.mkdirSync(Constants.GEWE_PATH, {recursive: true})
        }
        return new Promise<boolean>((resolve, reject) => {

            if (this.hasLogin) {
                return reject(new Error("Login failed."));
            }


            this.loginTime = new Date().getTime() / 1000

            if (this.ready) {
                return this.bot.login().then(resolve).catch(reject)
            }

            this.bot.start().then(async ({app, router}) => {
                app.use(router.routes()).use(router.allowedMethods())

                // 更新 config 表 wx_id 插入缓存的 concat 和 room
                let prismaService = this.prismaService
                const config = prismaService.config()
                this.bot.info().then(async info => {
                    const botClient = this.botClient
                    if (info?.wxid) {
                        this.me = info
                        prismaService.prisma.config.findFirstOrThrow({
                            where: {
                                bot_token: ConfigEnv.BOT_TOKEN,
                                NOT: [
                                    {login_wxid: info?.wxid},
                                ]
                            }
                        }).then((res) => {
                            if (!res?.login_wxid) {
                                config.update({
                                    where: {
                                        id: res.id
                                    },
                                    data: {
                                        login_wxid: info.wxid,
                                    }
                                }).then(() => {
                                    prismaService.createOrUpdateWxConcatAndRoom(info.wxid).then()
                                })
                            }
                            if (res) {
                                config.create({
                                    data: {
                                        bot_chat_id: res.bot_chat_id,
                                        bot_token: ConfigEnv.BOT_TOKEN,
                                        // 复制上一份配置
                                        setting: res.setting ?? defaultSetting,
                                        bot_id: res.bot_id,
                                        login_wxid: info.wxid,
                                    },
                                }).then().catch((err) => {
                                    this.logDebug('已经存在')
                                }).finally(() => {
                                    prismaService.createOrUpdateWxConcatAndRoom(info.wxid).then()
                                })

                            }

                        }).catch((e) => this.logDebug(e))

                    }
                    if (this.scanPhotoMsgId?.length > 0) {
                        prismaService.getConfigByToken().then(findConfig => {
                            const chatId = findConfig.bot_chat_id
                            botClient.bot.telegram.deleteMessages(Number(chatId),
                                this.scanPhotoMsgId).then((res) => {
                                this.scanPhotoMsgId = []
                                botClient.sendMessage({
                                    msgType: "text",
                                    content: '微信登录成功',
                                    notRecord: true,
                                })
                            }).catch((err) => {
                                this.logError('删除消息', this.scanPhotoMsgId, err)
                            })
                        })
                    }
                    this.hasLogin = true
                    this.ready = true
                }).catch(e => {
                    this.logError('WxClient get info error : %s', e)
                })
                this.onMessage(null)
                this.loginTime = new Date().getTime() / 1000
                resolve(true)

            }).catch(e => {
                reject(new Error(e))
            })

            this.onMessage(null)
        })
    }

    logout(): Promise<boolean> {
        return new Promise<boolean>((resolve, reject) => {
            this.bot.logout().then(() => {
                this.hasLogin = false
                resolve(true)
            }).catch(reject)
        })
    }

    sendMessage(msgParams: SendMessage): Promise<Record<string, any>> {
        return new Promise<Record<string, any>>((resolve, reject) => {
            // 查找是群还是用户
            this.prismaService.getConfigCurrentLoginWxAndToken()
                .then(res => {
                    this.prismaService.prisma.group.findUniqueOrThrow({
                        where: {
                            tg_group_id: msgParams.chatId,
                            config_id: res.id,
                        },
                        include: {
                            wx_room: true,
                            wx_contact: true
                        }
                    }).then(group => {
                        const send = (to: Contact | Room) => {
                            switch (msgParams.msgType) {
                                case "text":
                                    this.logDebug('wx 发消息', msgParams)
                                    to.say(msgParams.content).then(resolve).catch(reject)
                                    break;
                                case 'video': // 视频使用文件类型
                                case "file":
                                case "audio":
                                case "image": {
                                    const forceType = msgParams.msgType === 'image' ? 'image' : 'file'
                                    let file = msgParams.file as string;
                                    if (!file.startsWith('http')) {
                                        file = new URL(file.substring(Constants.SAVE_PATH.length), getBaseHttpAddress()).toString();
                                    }
                                    const fileBox = Filebox.fromUrl(file, forceType)
                                    to.say(fileBox).then(resolve).catch(reject)
                                }
                                    break;
                                case "quote":
                                    this.prismaService.prisma.message.findFirst({
                                        where: {
                                            group_id: group.id,
                                            tg_msg_id: msgParams.replyId
                                        }
                                    }).then(quoteMsg => {
                                        quote({
                                            title: msgParams.content,
                                            toWxId: group.wx_id,
                                            newMsgId: quoteMsg.wx_msg_id,
                                            content: quoteMsg.content,
                                        }).then(resolve).catch(reject)
                                    })
                                    break;
                                default:
                                    break;

                            }
                        }
                        if (group.is_wx_room && group?.wx_room?.chatroomId) {
                            // @ts-ignore
                            this.bot.Room.find({id: group?.wx_room?.chatroomId}).then(room => {
                                send(room)
                            })
                        } else if (group.wx_contact?.userName) {
                            this.bot.Contact.find({wxid: group.wx_contact?.userName}).then(contact => {
                                send(contact)
                            }).catch((e) => {
                                this.logError('find contact error : %s', e)
                            })
                        }

                    }).catch(e => {
                        this.logError('WxClient find group error: %s', e)
                    })
                }).catch(e => {
                reject(new Error(e))
            })

        })
    }

    check(): Promise<any> {
        return this.bot.checkOnline()
    }

    onMessage(any: any): void {
        this.bot.on('scan', qrcode => {
            if (qrcode) {
                QRCode.toBuffer(qrcode.content, {
                    width: 150
                }, (error, buffer) => {
                    const tgBot = this.botClient
                    if (!error) {
                        this.prismaService.getConfigByToken()
                            .then(findConfig => {
                                const chatId = findConfig.bot_chat_id
                                tgBot.bot.telegram.sendPhoto(Number(chatId), {source: buffer},
                                    {caption: '请使用「微信」扫码登录'})
                                    .then((res) => {
                                        this.scanPhotoMsgId.push(res.message_id)
                                    })
                            })
                    }
                })
            }
        })
        this.bot.on('message', async (msg) => {

                if (await this.wxMessageHelper.isDuplicateMessage(msg._newMsgId + '')) {
                    return
                }

                // 只处理登录之后的消息 且不是发送给文件助手的消息
                // 没有类型的消息不处理，大多是通知或者无法处理的消息
                if (msg._createTime >= this.loginTime
                    && msg.toId !== Constants.FILE_HELPER
                    && msg.type()) {
                    this.wxMessageHelper.sendMessages(msg).then()
                }
            }
        )
        this.bot.on('room-invite', async (roomInvitation) => {

        })
        this.bot.on('friendship', async (friendship) => {
            // @ts-ignore - gewechaty Friendship type has these properties
            const fromId = friendship.fromId;
            if (await this.wxMessageHelper.isDuplicateMessage(fromId + '')) {
                return;
            }

            this.friendshipList.push(friendship);
            const tgBotClient = this.botClient;

            tgBotClient.sendMessage({
                msgType: 'text',
                // @ts-ignore - gewechaty Friendship type has these properties
                content: `<b>${friendship.fromName}</b> 请求添加您为好友:\n  ${friendship.hello()}`,
                ext: {
                    parse_mode: 'HTML',
                    reply_markup: {
                        // @ts-ignore - gewechaty Friendship type has these properties
                        inline_keyboard: [[Markup.button.callback('接受', `fr:${friendship.fromId}`)]]
                    }
                },
                notRecord: true,
            }).catch(e => {
                tgBotClient.sendMessage({
                    msgType: "text",
                    content: '接收到了好友请求，请在手机查看'
                });
            });
        })
        this.bot.on('all', payload => {
        })
        // 撤回消息
        this.bot.on('revoke', async msg => {
            parseRevokeMsgPayload(msg.text()).then(sysMsgPayload => {
                const botClient = this.botClient
                this.wxMessageHelper.isDuplicateMessage(sysMsgPayload.revokemsg?.newmsgid).then(result => {
                    if (result) {
                        return
                    }
                    this.prismaService.prisma.message.findFirstOrThrow({
                        where: {
                            wx_msg_id: sysMsgPayload.revokemsg?.newmsgid
                        },
                        include: {
                            group: true
                        }
                    }).then(message => {
                        botClient.bot.telegram.sendMessage(Number(message.group.tg_group_id), '消息被撤回', {
                            reply_parameters: {
                                message_id: Number(message.tg_msg_id)
                            }
                        }).then(() => {

                        })
                    })
                })

            })
        })
    }

}