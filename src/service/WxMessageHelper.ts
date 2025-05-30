import {AbstractService} from "../base/IService";
import {Contact, Filebox, Message} from "gewechaty";
import PrismaService from "./PrismaService";
import TgClient from "../client/TgClient";
import {Api} from "telegram";
import type {config, group} from '@prisma/client'
import {WxClient} from "../client/WxClient";
import {ClientEnum} from "../constant/ClientConstants";
import {MessageService} from "./MessageService";
import {parseAppMsgMessagePayload, parseQuoteMsg} from "../util/MessageUtils";
import {SendMessage} from "../base/IMessage";
import FileUtils from "../util/FileUtils";
import {SettingType} from "../util/SettingUtils";
import {CustomFile} from "telegram/client/uploads";
import {createChannel} from "./UserClientHelper";
import {RoomMemberType} from "../entity/Contact";
import {ConfigEnv} from "../config/Config";
import BotClient from "../client/BotClient";
import {MessageType} from "../entity/Message";
import {singleton} from "tsyringe";
import {WxFileClient} from "../client/WxFileClient";
import {getService} from "../di";

@singleton()
export class WxMessageHelper extends AbstractService {
    private readonly messageService: MessageService;
    private readonly tgClient: TgClient;
    private readonly botClient: BotClient;
    private readonly wxFileClient: WxFileClient;
    private readonly prismaService: PrismaService;
    private readonly messageSet: Set<string> = new Set();

    constructor() {
        super();
        this.messageService = getService(MessageService);
        this.tgClient = getService(TgClient);
        this.botClient = getService(BotClient);
        this.wxFileClient = getService(WxFileClient);
        this.prismaService = getService(PrismaService);
    }

    public async getTitle(msg: Message): Promise<string> {
        return new Promise<string>((resolve) => {
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
                    if (contact.wxid() === msg.wxid) {
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
        return new Promise((resolve, reject) => {

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
                    const createGroupParams = {
                        isRoom: msg.isRoom,
                        loginWxId: msg.wxid,
                        roomId: msg.roomId,
                        fromId: msg.fromId,
                        configId: config.id,
                        channelId: 0,
                        title: title,
                    }
                    createChannel(
                        createGroupParams,
                        [Number(config.bot_chat_id), Number(config.bot_id)],
                        resolve)
                } else {
                    // 重复的消息不处理，经过一段时间还是有可能有重复的消息
                    this.prismaService.prisma.message.findFirst({
                        where: {wx_msg_id: msg._newMsgId?.toString(), group_id: existGroup.id},
                    }).then(async (message) => {
                        if (message) {
                            this.logDebug('重复消息 id: %s', message.id)
                            reject(new Error('重复消息, 不处理'))
                        } else if (!existGroup?.wx_room_id || !existGroup?.wx_contact_id) {
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
                                    this.tgClient.bot.uploadFile({
                                        file: new CustomFile('avatar.jpg', file.length, null, file),
                                        workers: 2,
                                    }).then(photo => {
                                        this.tgClient.bot.invoke(new Api.channels.EditPhoto({
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
                                        this.logError('createTgGroup error not found room or contact in pg')
                                    }
                                })
                            })
                        }
                    })
                }
            }).catch(e => {
                reject(new Error(e))
            })
        })

    }

    public async sendMessages(msg: Message) {
        const wxMsgType = getService(WxClient).bot.Message.Type;

        if (!msg.type()) {
            // 没有类型的消息不处理，大多是通知或者无法处理的消息
            return
        }

        this.prismaService.getConfigCurrentLoginWxAndToken().then(async config => {
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
                    // 当前群组转发状态
                    if (!res.forward) {
                        return
                    }
                    const chatId = Number(res.tg_group_id);
                    let content = msg.text()
                    let title = ''
                    let wx_msg_user_name: string | void = ''
                    const talker = await msg.talker();
                    if (msg._self) {
                        title = '你:'
                        wx_msg_user_name = '你'
                    } else {
                        wx_msg_user_name = (await talker.alias()) ?? talker.name()
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
                        fromWxId: talker.wxid() || msg.wxid,
                        wxMsgUserName: wx_msg_user_name || '',
                        wxMsgType: msg._type,
                        ext: {
                            wxMsgId: msg._newMsgId,
                            msgId: msg._msgId,
                            wxMsgCreate: msg._createTime,
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
                                this.logDebug('Quote message: %s', msg)
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
                                }).catch(() => {
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
                        case wxMsgType.Image: {
                            // 先发送文字
                            addMessage.content = msg._self ? '你发送了[图片]' : '收到[图片]'
                            addMessage.wxMsgTypeText = MessageType.Image;
                            this.messageService.addMessages(addMessage, ClientEnum.TG_BOT)
                            const editMsgImage = (fileBox: Filebox) => {
                                this.prismaService.prisma.message.findFirst({
                                    where: {wx_msg_id: msg._newMsgId?.toString(), from_wx_id: msg.fromId},
                                    include: {group: true}
                                }).then(existingMessage => {
                                    const tgGroupId = Number(existingMessage?.group?.tg_group_id);
                                    if (tgGroupId && fileBox && fileBox.url !== ConfigEnv.FILE_API) {
                                        FileUtils.downloadBuffer(fileBox.url).then(fileBuffer => {
                                            this.botClient.bot.telegram.editMessageMedia(tgGroupId,
                                                Number(existingMessage.tg_msg_id),
                                                null, {
                                                    type: 'photo',
                                                    media: {source: fileBuffer},
                                                    caption: `${wx_msg_user_name}`,
                                                })
                                        })
                                    }

                                    // 这里有可能是消息还没保存到数据库，所以 tgGroupId 为空
                                    if (!tgGroupId || !existingMessage.tg_msg_id) {
                                        setTimeout(() => {
                                            editMsgImage(fileBox)
                                        }, 1500)
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
                                        this.logError("No valid file found");
                                    });
                            }

                            processFileBox(msg)
                        }
                            break;
                        case wxMsgType.Voice:
                            addMessage.content = msg._self ? '发送[语音]' : '收到[语音]'
                            addMessage.ext.wxMsgText = msg.text()
                            this.messageService.addMessages(addMessage, ClientEnum.TG_BOT)
                            break;
                        case wxMsgType.Emoji:
                            addMessage.msgType = 'emoji'

                            parseAppMsgMessagePayload(msg.text()).then(appMsg => {
                                if (appMsg?.emoji) {
                                    FileUtils.downloadBuffer(appMsg?.emoji.cdnurl)
                                        .then(file => {
                                            addMessage.file = file
                                            addMessage.content = '[表情]'
                                            addMessage.wxMsgTypeText = MessageType.Emoji;
                                            addMessage.ext.wxMsgText = msg.text()
                                            addMessage.ext.width = appMsg.emoji.width
                                            addMessage.ext.height = appMsg.emoji.height
                                            this.messageService.addMessages(addMessage, ClientEnum.TG_BOT)
                                        })
                                }
                            })
                            break;
                        case wxMsgType.Video:
                        case wxMsgType.File:
                            addMessage.wxMsgTypeText = MessageType.File;
                            if (msg.type() === wxMsgType.Video) {
                                addMessage.wxMsgTypeText = MessageType.Video;
                            }

                            this.logDebug('Video/File message: %s', msg.text())
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
                            this.logDebug('Pat message: %s', msg.text())
                            break;
                    }

                }

            })
        })
    }


    public async isDuplicateMessage(msgId: string): Promise<boolean> {
        // 先检查内存中是否存在
        if (this.messageSet.has(msgId)) {
            return true;
        }

        // 添加到内存中
        this.messageSet.add(msgId);
        // 一分钟后从内存中删除
        setTimeout(() => this.messageSet.delete(msgId), 60000);

        // 如果内存中不存在，检查数据库
        return new Promise(resolve => {
            this.prismaService.prisma.wx_msg_filter.upsert({
                where: { id: msgId },
                create: { id: msgId },
                update: {}, // 如果存在就不做任何更新
            }).then((res) => {
                // 如果记录是新创建的，说明不是重复消息
                return resolve(false);
            }).catch(e => {
                this.logError("isDuplicateMessage error: ", e);
                return resolve(false);
            });
        });
    }
}