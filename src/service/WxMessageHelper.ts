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
import {JsonObject} from "@prisma/client/runtime/client";
import {SettingType} from "../util/SettingUtils";
import {CustomFile} from "telegram/client/uploads";
import {addToFolder, createGroupWithHeadImg} from "./UserClientHelper";
// import {Settings} from "../util/SettingUtils";

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
                        // 升级成超级群组
                        this.tgUserClient.bot?.invoke(
                            new Api.messages.MigrateChat({
                                // @ts-ignore
                                chatId: result.updates?.chats[0]?.id,
                            })
                        ).then((res) => {
                            // if (res instanceof )
                            // LogUtils.debug(res)
                            if (res instanceof Api.Updates) {
                                const channelId = res.chats.find(it => {
                                    return it instanceof Api.Channel
                                })?.id

                                if (channelId) {
                                    this.tgUserClient.bot.invoke(
                                        new Api.channels.TogglePreHistoryHidden({
                                            channel: channelId,
                                            enabled: false,
                                        })
                                    );
                                    LogUtils.debug('createGroup result : %s', JSON.stringify(result.toJSON()))
                                    const tgGroupId = Number(-100 + channelId.toString());
                                    createGroupWithHeadImg(msg, title, tgGroupId, resolve)
                                } else {
                                    LogUtils.error('升级群组设置权限错误')
                                }

                            }
                        })
                    })
                } else {
                    resolve(existGroup)
                    // 检查头像是否需要更新
                    const query = msg.isRoom ?
                        this.prismaService.prisma.wx_room.findUnique({
                            where: {
                                wx_id_chatroomId: {
                                    wx_id: msg.wxid,
                                    chatroomId: msg.roomId,
                                },
                            }
                        }) :
                        this.prismaService.prisma.wx_contact.findUnique({
                            where: {
                                wx_id_userName: {
                                    wx_id: msg.wxid,
                                    userName: msg.fromId,
                                },
                            }
                        });
                    query.then(entity => {
                        if (entity) {
                            const updatePhoto = (url: string) => FileUtils.downloadBuffer(url)
                                .then(file => {
                                    this.tgUserClient.bot.uploadFile({
                                        file: new CustomFile('avatar.jpg', file.length, null, file),
                                        workers: 2,
                                    }).then(photo => {
                                        this.tgUserClient.bot.invoke(new Api.channels.EditPhoto({
                                            channel: Number(existGroup.tg_group_id),
                                            photo: new Api.InputChatUploadedPhoto({
                                                file: photo,
                                            })
                                        })).then()
                                    })
                                })
                            if (msg.isRoom) {
                                if (entity.smallHeadImgUrl !== existGroup.headImgUrl) {
                                    this.prismaService.prisma.group.update({
                                        where: {id: existGroup.id},
                                        data: {headImgUrl: entity.smallHeadImgUrl}
                                    }).then()
                                    updatePhoto(entity.smallHeadImgUrl)
                                }
                            } else if (entity.bigHeadImgUrl !== existGroup.headImgUrl) {
                                this.prismaService.prisma.group.update({
                                    where: {id: existGroup.id},
                                    data: {headImgUrl: entity.bigHeadImgUrl}
                                }).then()
                                updatePhoto(entity.bigHeadImgUrl)
                            }
                        }
                    })
                }
            }).catch(e => {
                reject(e)
            })
        })

    }

    public async sendMessages(msg: Message) {
        const wxMsgType = WxClient.getInstance().bot.Message.Type;
        // 消息可能重复的情况
        this.prismaService.prisma.message.findFirst({
            where: {wx_msg_id: msg._newMsgId, from_wx_id: msg.fromId}
        }).then(existMsg => {
            this.prismaService.getConfigByToken().then(config => {
                if (config.setting) {
                    const setting = config.setting as SettingType
                    // 不接收公众号消息
                    if (setting.blockPublicMessages && msg.fromId.startsWith('gh_')) {
                        return
                    }
                }
                if (!existMsg) {
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
                                    parseQuoteMsg(msg.text()).then(quoteMsg => {
                                        LogUtils.debug('Quote message: %s', msg)
                                        this.prismaService.prisma.message.findFirst({
                                            where: {wx_msg_id: quoteMsg.parentId}
                                        }).then(parentMsg => {
                                            this.messageService.addMessages({
                                                ...addMessage,
                                                parentId: Number(parentMsg.id),
                                                replyId: Number(parentMsg.tg_msg_id),
                                                content: quoteMsg?.title,
                                                ext: {
                                                    ...addMessage.ext,
                                                    ...quoteMsg,
                                                },
                                                msgType: 'quote',
                                            }, ClientEnum.TG_BOT)
                                        }).catch(e => {
                                            this.messageService.addMessages({
                                                ...addMessage,
                                                content: quoteMsg?.title,
                                                ext: {
                                                    ...addMessage.ext,
                                                    ...quoteMsg,
                                                },
                                                msgType: 'quote',
                                            }, ClientEnum.TG_BOT)
                                        })
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
                                    LogUtils.debug('File message: %s', msg.text())
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
            })
        })
    }
}