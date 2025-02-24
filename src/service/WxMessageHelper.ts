import {Singleton} from "../base/IService";
import {Contact, Filebox, Message} from "gewechaty";
import PrismaService from "./PrismaService";
import TgClient from "../client/TgClient";
import {Api} from "telegram";
import type {group, config} from '@prisma/client'
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
import {RoomMemberType} from "../entity/Contact";
import {ConfigEnv} from "../config/Config";
import BotClient from "../client/BotClient";
import InputMediaPhoto = Api.InputMediaPhoto;
import {MessageType} from "../entity/Message";
// import {Settings} from "../util/SettingUtils";

export default class WxMessageHelper extends Singleton<WxMessageHelper> {

    private prismaService = PrismaService.getInstance(PrismaService);
    private messageService = MessageService.getInstance(MessageService);
    private tgUserClient = TgClient.getInstance()
    private tgBotClient = BotClient.getInstance()

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

    public async createGroup(msg: Message, config: config): Promise<group> {
        let wxId = null
        if (!msg.isRoom) {
            wxId = msg.fromId
        } else {
            wxId = msg.roomId
        }
        // 自己发的消息不创建
        if (msg._self) {
            wxId = msg.isRoom ? msg.roomId : msg.toId
        }
        return new Promise(async (resolve, reject) => {

            // 重复的消息不处理，经过一段时间还是有可能有重复的消息

            this.prismaService.prisma.group.findUnique({
                where: {
                    config_id_wx_id: {
                        config_id: config.id,
                        wx_id: wxId
                    }
                }
            }).then(async existGroup => {
                if (!existGroup) {
                    const title = await this.getTitle(msg) || 'wx2tg_未命名群组';
                    this.tgUserClient.bot?.invoke(
                        new Api.messages.CreateChat({
                            users: [Number(config.bot_chat_id), Number(config.bot_id)],
                            title: title,
                            ttlPeriod: 0
                        })
                    ).then(result => {
                        LogUtils.info('创建普通群组成功', title)
                        // 升级成超级群组
                        this.tgUserClient.bot?.invoke(
                            new Api.messages.MigrateChat({
                                // @ts-ignore
                                chatId: result.updates?.chats[0]?.id,
                            })
                        ).then(async (res) => {
                            LogUtils.info('升级超级群组成功', title)
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
                                    ).then(() => {
                                        LogUtils.info('TogglePreHistoryHidden', title)
                                        const tgGroupId = Number(-100 + channelId.toString());
                                        createGroupWithHeadImg(msg, title, tgGroupId, config.id, resolve)
                                    })
                                    LogUtils.debug('createGroup result : %s', JSON.stringify(result.toJSON()))
                                } else {
                                    LogUtils.error('升级群组设置权限错误')
                                }

                            }
                        })
                    })
                } else {
                    // 重复的消息不处理，经过一段时间还是有可能有重复的消息
                    this.prismaService.prisma.message.findFirst({
                        where: {wx_msg_id: msg._newMsgId, group_id: existGroup.id},
                    }).then(async (message) => {
                        if (message) {
                            LogUtils.debug('重复消息 id: %s', message.id)
                            resolve(existGroup)
                        } else {
                            if (!existGroup?.wx_room_id || !existGroup?.wx_contact_id) {
                                await this.prismaService.createOrUpdateWxConcatAndRoom()
                                // 重新查询
                                if (msg.isRoom) {
                                    this.prismaService.prisma.wx_room.findUnique({
                                        where: {
                                            wx_id_chatroomId: {
                                                wx_id: msg.wxid,
                                                chatroomId: wxId,
                                            }
                                        },
                                    }).then((roomInPg => {
                                        if (roomInPg) {
                                            existGroup.wx_room_id = roomInPg.id
                                            this.prismaService.prisma.group.update({
                                                where: {id: existGroup.id},
                                                data: {
                                                    wx_room_id: roomInPg.id,
                                                }
                                            }).then()
                                            resolve(existGroup)
                                        }
                                    }))
                                } else {
                                    this.prismaService.prisma.wx_contact.findUnique({
                                        where: {
                                            wx_id_userName: {
                                                wx_id: msg.wxid,
                                                userName: wxId,
                                            }
                                        }
                                    }).then((contactInPg => {
                                        if (contactInPg) {
                                            existGroup.wx_contact_id = contactInPg.id
                                            this.prismaService.prisma.group.update({
                                                where: {id: existGroup.id},
                                                data: {
                                                    wx_contact_id: contactInPg.id,
                                                }
                                            }).then()
                                            resolve(existGroup)
                                        }
                                    }))
                                }
                            } else {
                                resolve(existGroup)
                            }
                        }
                    })
                    // 检查头像是否需要更新
                    // 自己发的消息不更新头像
                    if (msg._self) {
                        return
                    }
                    // 后面去更新头像
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
                        const doCreateGroup = (existEntity) => {
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
                                if (existEntity.smallHeadImgUrl !== existGroup.headImgUrl) {
                                    this.prismaService.prisma.group.update({
                                        where: {id: existGroup.id},
                                        data: {
                                            headImgUrl: existEntity.smallHeadImgUrl,
                                            wx_contact_id: msg.isRoom ? null : existEntity?.id,
                                            wx_room_id: msg.isRoom ? existEntity?.id : null,
                                        }
                                    }).then()
                                    updatePhoto(existEntity.smallHeadImgUrl)
                                }
                            } else if (!msg._self && existEntity.bigHeadImgUrl !== existGroup.headImgUrl) {
                                this.prismaService.prisma.group.update({
                                    where: {id: existGroup.id},
                                    data: {
                                        headImgUrl: existEntity.bigHeadImgUrl,
                                        wx_contact_id: msg.isRoom ? null : existEntity?.id,
                                        wx_room_id: msg.isRoom ? existEntity?.id : null,
                                    }
                                }).then()
                                updatePhoto(existEntity.bigHeadImgUrl)
                            }
                        }
                        if (entity) {
                            doCreateGroup(entity)
                        } else { // 没找到的情况下去 sqlite 更新
                            this.prismaService.createOrUpdateWxConcatAndRoom().then(() => {
                                query.then(en => {
                                    if (en) {
                                        doCreateGroup(en)
                                    } else {
                                        LogUtils.error('createTgGroup error not found room or contact in pg')
                                    }
                                })
                            })
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

        if (!msg.type()) {
            // 没有类型的消息不处理，大多是通知或者无法处理的消息
            return
        }

        this.prismaService.getConfigByToken().then(async config => {
            if (config.setting) {
                const setting = config.setting as SettingType
                // 不接收公众号消息
                if (setting.blockPublicMessages && msg.fromId.startsWith('gh_')) {
                    return
                }
                // 自己发送的消息
                if (setting.blockYouSelfMessage && msg._self) {
                    return
                }
            }
            await this.createGroup(msg, config).then(async (res) => {
                if (res) {
                    const chatId = Number(res.tg_group_id);
                    let content = msg.text()
                    let title
                    let wx_msg_user_name
                    if (msg._self) {
                        title = '你:'
                        wx_msg_user_name = '你'
                    } else {
                        const talker = await msg.talker();
                        wx_msg_user_name = talker._alias ?? talker._name
                    }
                    if (msg.isRoom) {
                        const wx_room = await this.prismaService.prisma.wx_room.findUnique({
                            where: {
                                wx_id_chatroomId: {
                                    wx_id: msg.wxid,
                                    chatroomId: msg.roomId,
                                }
                            }
                        })
                        if (wx_room?.memberList) {
                            const members: RoomMemberType[] = JSON.parse(wx_room?.memberList)
                            const member = members.find(m => m.wxid === msg.fromId)
                            if (member) {
                                title = `${member.displayName ? member.displayName : member.nickName}:`
                                wx_msg_user_name = title
                            }
                        } else {
                            title = '未知用户:'
                        }

                    }
                    const addMessage: SendMessage = {
                        chatId: chatId,
                        content: content,
                        title: title,
                        msgType: 'text',
                        fromWxId: msg.fromId,
                        wxMsgUserName: wx_msg_user_name,
                        wxMsgType: msg._type,
                        ext: {
                            wxMsgId: msg._newMsgId,
                        }
                    }
                    switch (msg.type()) {
                        case wxMsgType.Unknown:
                            this.logDebug('Unknown message: %s', msg.text())
                            break;
                        case wxMsgType.RedPacket:
                            addMessage.wxMsgTypeText = MessageType.RedPacket;
                            parseAppMsgMessagePayload(msg.text()).then(appMsg => {
                                const titlePrefix = msg._self ? '你发送了一个[红包]' : `${wx_msg_user_name}发送了一个[红包]`
                                const send = (file: Buffer) => {
                                    this.messageService.addMessages({
                                        ...addMessage,
                                        title: titlePrefix,
                                        content: appMsg?.wcpayinfo?.sendertitle ?? '恭喜发财，大吉大利',
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
                            addMessage.wxMsgTypeText = MessageType.Quote;
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
                                        title: title,
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
                            addMessage.wxMsgTypeText = MessageType.Text;
                            this.messageService.addMessages(addMessage, ClientEnum.TG_BOT)
                            break;
                        // 文件类型的消息
                        case wxMsgType.Image:
                            // 先发送文字
                            addMessage.content = msg._self ? '你发送了[图片]' : '收到[图片]'
                            addMessage.wxMsgTypeText = MessageType.Image;
                            this.messageService.addMessages(addMessage, ClientEnum.TG_BOT)
                            const editMsgImage = (fileBox: Filebox) => {
                                this.prismaService.prisma.message.findFirst({
                                    where: {wx_msg_id: msg._newMsgId, from_wx_id: msg.fromId},
                                    include: {group: true}
                                }).then(existingMessage => {
                                    const tgGroupId = Number(existingMessage?.group?.tg_group_id);
                                    if (tgGroupId && fileBox && fileBox.url !== ConfigEnv.FILE_API) {
                                        FileUtils.downloadBuffer(fileBox.url).then(fileBuffer => {
                                            this.tgBotClient.bot.telegram.editMessageMedia(tgGroupId,
                                                Number(existingMessage.tg_msg_id),
                                                null, {
                                                    type: 'photo',
                                                    media: {source: fileBuffer},
                                                })
                                        })
                                    }

                                    // 这里有可能是消息还没保存到数据库，所以 tgGroupId 为空
                                    if (!tgGroupId) {
                                        setTimeout(() => {
                                            editMsgImage(fileBox)
                                        }, 1000)
                                    }

                                })
                            }

                            const processFileBox = (msg: Message) => {
                                const getFileBox = async (type: number) => {
                                    try {
                                        let fileBox = await msg.toFileBox(type);
                                        if (fileBox?.url !== ConfigEnv.FILE_API) {
                                            editMsgImage(fileBox);
                                            return true;  // 返回成功标志
                                        }
                                        return false;  // 文件API路径，继续尝试
                                    } catch (e) {
                                        return false;  // 获取文件失败，继续尝试
                                    }
                                };

                                // 尝试依次获取文件，优先顺序为 1 -> 2 -> 3
                                getFileBox(1)
                                    .then(success1 => {
                                        if (!success1) return getFileBox(2);
                                    })
                                    .then(success2 => {
                                        if (!success2) return getFileBox(3);
                                    })
                                    .catch(() => {
                                        LogUtils.error("No valid file found");
                                    });
                            }

                            processFileBox(msg)
                            break;
                        case wxMsgType.Voice:
                            break;
                        case wxMsgType.Emoji:

                            LogUtils.debug('Emoji message: %s', msg.text())
                            // msg.toFileBox().then(fileBox => {
                            //     LogUtils.debug('Voice/Emoji message: %s', fileBox?.name)
                            //     fileBox.toFile(`storage/downloads/${fileBox?.name}`)
                            // })
                            break;
                        case wxMsgType.Video:
                        case wxMsgType.File:
                            addMessage.wxMsgTypeText = MessageType.File;
                            if (msg.type() === wxMsgType.Video) {
                                addMessage.wxMsgTypeText = MessageType.Video;
                            }

                            LogUtils.debug('Video/File message: %s', msg.text())
                            // 先发送文字, 自己发的就不转发了
                            if (!msg._self) {
                                parseAppMsgMessagePayload(msg.text())
                                    .then(appMsg => {
                                        addMessage.content = '收到[文件] ' + appMsg?.title
                                        if (msg.type() === wxMsgType.Video) {
                                            addMessage.content = '收到[视频]'
                                        }
                                        addMessage.msgType = msg.type() === wxMsgType.File ? 'file' : 'video'
                                        addMessage.ext.wxMsgText = msg.text()
                                        this.messageService.addMessages(addMessage, ClientEnum.TG_BOT)
                                    })
                            }
                            break;
                        case wxMsgType.Pat:
                            LogUtils.debug('Pat message: %s', msg.text())
                            break;
                    }

                }

            })
        })
    }
}