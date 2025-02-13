import {Singleton} from "../base/IService";
import {Contact, Message} from "gewechaty";
import PrismaService from "./PrismaService";
import TgClient from "../client/TgClient";
import {Api} from "telegram";
import type {group} from '@prisma/client'
import {WxClient} from "../client/WxClient";
import {ClientEnum} from "../constant/ClientConstants";
import {MessageService} from "./MessageService";
import {LogUtils} from "../util/LogUtils";
import {parseAppMsgMessagePayload, parseQuoteMsg} from "../util/MessageUtils";
import {SendMessage} from "../base/IMessage";
import FileUtils from "../util/FileUtils";

export default class WxMessageHelper extends Singleton<WxMessageHelper> {

    private prismaService = PrismaService.getInstance(PrismaService);
    private messageService = MessageService.getInstance(MessageService);
    private tgUserClient = TgClient.getInstance()

    constructor() {
        super();
    }

    public async getTitle(msg: Message): Promise<string> {
        return new Promise<string>((resolve, reject) => {
            if (msg.isRoom) {
                msg.room().then(room => {
                    if (room) {
                        resolve(room.name)
                    }
                })
            } else {
                msg.from().then(contact => {
                    const getTitle = (_contact: Contact) => {
                        _contact.alias()
                            .then(alias => {
                                if (alias) {
                                    resolve(alias)
                                } else {
                                    resolve(_contact.name())
                                }
                            });
                    }
                    // 自己的情况下 名称用对方的
                    if (contact._wxid === msg.wxid) {
                        msg.to().then(toContact => {
                            getTitle(toContact)
                        })
                    } else {
                        getTitle(contact)
                    }
                })
            }
        })
    }

    public async createGroup(msg: Message): Promise<group> {
        let wxId = null
        if (!msg.isRoom) {
            wxId = msg.fromId
        } else {
            wxId = msg.roomId
        }
        // 自己发的消息不创建新的文件夹
        if (wxId === msg.wxid) {
            wxId = msg.isRoom ? msg.roomId : msg.toId
        }
        return new Promise((resolve, reject) => {
            this.prismaService.prisma.group.findFirst({
                where: {wx_id: wxId}
            }).then(async existGroup => {
                if (!existGroup) {
                    const config = await this.prismaService.getConfigByToken()
                    const title = await this.getTitle(msg) || 'wx2tg_未命名群组';
                    this.tgUserClient.bot?.invoke(
                        new Api.messages.CreateChat({
                            users: [Number(config.bot_chat_id), Number(config.bot_id)],
                            title: title,
                            ttlPeriod: 0
                        })
                    ).then(result => {
                        LogUtils.info('createGroup result : %s', JSON.stringify(result.toJSON()))
                        // @ts-ignore
                        const groupId = result.updates?.chats[0]?.id;
                        const createGroup = {
                            wx_id: wxId,
                            tg_group_id: -groupId,
                            group_name: title,
                            is_wx_room: msg.isRoom,
                        };
                        this.prismaService.prisma.group.create({
                            data: createGroup
                        }).then((res) => {
                            this.addToFolder(Number(res.tg_group_id))
                            resolve(res)
                        })
                    })
                } else {
                    // this.addToFolder(Number(existGroup.tg_group_id))
                    resolve(existGroup)
                }
            }).catch(e => {
                reject(e)
            })
        })

    }

    public async sendMessages(msg: Message) {
        const wxMsgType = WxClient.getInstance().bot.Message.Type;
        this.createGroup(msg).then(async (res) => {
            if (res) {
                const chatId = Number(res.tg_group_id);
                const addMessage: SendMessage = {
                    chatId: chatId,
                    content: msg.text(),
                    msgType: 'text',
                    fromWxId: msg.fromId,
                    ext: {
                        wxMsgId: msg._newMsgId,
                    }
                }
                switch (msg.type()) {

                    case wxMsgType.Unknown:
                        this.logDebug('Unknown message: %s', msg.text())
                        break;
                    case wxMsgType.RedPacket:
                        parseAppMsgMessagePayload(msg.text()).then(appMsg => {
                            const titlePrefix = msg._self ? '你发送了一个红包\n' : '收到了一个红包\n'
                            let title = titlePrefix + (appMsg?.wcpayinfo?.sendertitle ?? '恭喜发财，大吉大利')
                            const send = (file: Buffer) => {
                                this.messageService.addMessages({
                                    ...addMessage,
                                    content: title,
                                    msgType: 'redPacket',
                                    file: file,
                                }, ClientEnum.TG_BOT)
                            }
                            const recshowsourceurl = appMsg?.wcpayinfo?.recshowsourceurl;
                            const thumburl = appMsg?.thumburl;
                            if (recshowsourceurl) {
                                FileUtils.downloadBuffer(recshowsourceurl).then(file => {
                                    send(file)
                                })
                            } else if (thumburl) {
                                FileUtils.downloadBuffer(thumburl).then(file => {
                                    send(file)
                                })
                            } else {
                                send(null)
                            }

                        })
                        break;
                    case wxMsgType.Quote:
                        // TODO 处理引用消息
                        parseQuoteMsg(msg.text()).then(quoteMsg => {
                            LogUtils.debug('Quote message: %s', msg)
                            this.messageService.addMessages({
                                ...addMessage,
                                content: quoteMsg?.title,
                                ext: quoteMsg,
                                msgType: 'quote',
                            }, ClientEnum.TG_BOT)
                        })
                        break;
                    case wxMsgType.Text:
                        LogUtils.debug('Text message: %s', msg)
                        this.messageService.addMessages(addMessage, ClientEnum.TG_BOT)
                        break;
                    // 文件类型的消息
                    case wxMsgType.Image:
                    case wxMsgType.Video:
                    case wxMsgType.Voice:
                    case wxMsgType.File:
                        // msg.toFileBox(msg.type())
                        //     .then(fileBox => {
                        //         this.messageService.addMessages({
                        //             msgType: 'text',
                        //             chatId: chatId,
                        //             content: '接收文件: ' + fileBox.name,
                        //         }, ClientEnum.TG_BOT)
                        //         fileBox.toFile(`storage/downloads/${fileBox.name}`)
                        //             .then((res) => {
                        //                 // 文件下载好了之后修改消息内容增加文件
                        //
                        //             })
                        //     })
                        break;
                    case wxMsgType.Emoji:
                        LogUtils.debug('Emoji message: %s', msg.text())
                        break;
                    case wxMsgType.Pat:
                        LogUtils.debug('Pat message: %s', msg.text())
                        break;
                }

            }

        })
    }

    async addToFolder(chatId: number): Promise<void> {
        this.tgUserClient.bot?.invoke(new Api.messages.GetDialogFilters()).then(result => {
            const dialogFilter: Api.TypeDialogFilter = result?.filters.find(it => {
                return it instanceof Api.DialogFilter && it.title === TgClient.DIALOG_TITLE
            })

            this.tgUserClient.bot?.getInputEntity(chatId).then(entity => {
                if (entity && dialogFilter instanceof Api.DialogFilter) {
                    const exist = dialogFilter.includePeers.find(it => {
                        if (it instanceof Api.InputPeerChat && entity instanceof Api.InputPeerChat) {
                            return it.chatId === entity.chatId
                        }
                        if (it instanceof Api.InputPeerChannel && entity instanceof Api.InputPeerChannel) {
                            return it.channelId === entity.channelId
                        }
                    })
                    if (!exist) {
                        dialogFilter.includePeers.push(entity)
                        this.tgUserClient.bot?.invoke(new Api.messages.UpdateDialogFilter({
                            id: dialogFilter.id,
                            filter: dialogFilter,
                        })).catch(e => {
                            LogUtils.warn('添加到文件夹失败: %s', e)
                        })
                    }
                }
            })

        })


    }


}