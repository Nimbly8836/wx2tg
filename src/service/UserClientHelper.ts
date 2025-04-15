// 新的公共函数
import FileUtils from "../util/FileUtils";
import {CustomFile} from "telegram/client/uploads";
import {Api} from "telegram";
import {LogUtils} from "../util/LogUtils";
import PrismaService from "./PrismaService";
import TgClient from "../client/TgClient";
import {returnBigInt} from "telegram/Helpers";
import {addToGroupIds} from "../util/CacheUtils";
import {container} from "tsyringe";

export function createChannel(createGroupParams: {
    isRoom: boolean,
    loginWxId: string,
    roomId: string,
    fromId: string,
    configId: number,
    channelId: number,
    title: string
}, users: Api.TypeEntityLike[], resolve: Function) {
    const tgUserClient = container.resolve(TgClient)
    const {title} = createGroupParams
    tgUserClient.bot?.invoke(
        new Api.messages.CreateChat({
            users: users,
            title: title,
            ttlPeriod: 0
        })
    ).then(result => {
        LogUtils.info('创建普通群组成功', title)
        // 升级成超级群组
        tgUserClient.bot?.invoke(
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
                    // 添加监听群组
                    addToGroupIds(channelId.toJSNumber())
                    tgUserClient.bot.invoke(
                        new Api.channels.TogglePreHistoryHidden({
                            channel: channelId,
                            enabled: false,
                        })
                    ).then(() => {
                        LogUtils.info('TogglePreHistoryHidden', title)
                        createGroupParams.channelId = Number(-100 + channelId.toString());
                        insertDbUpdateAvatar(createGroupParams, resolve)
                    })
                    LogUtils.debug('createGroup result : %s', JSON.stringify(result.toJSON()))
                } else {
                    LogUtils.debug('升级群组设置权限错误')
                }

            }
        })
    })
}

export function insertDbUpdateAvatar(createGroupParams: {
    isRoom: boolean,
    loginWxId: string,
    roomId: string,
    fromId: string,
    configId: number,
    channelId: number,
    title: string
}, resolve: Function) {

    const {isRoom, loginWxId, roomId, fromId, configId, channelId, title} = createGroupParams

    const prismaService = container.resolve(PrismaService);
    const query = isRoom ?
        prismaService.prisma.wx_room.findUnique({
            where: {
                wx_id_chatroomId: {
                    wx_id: loginWxId,
                    chatroomId: roomId,
                },
            }
        }) :
        prismaService.prisma.wx_contact.findUnique({
            where: {
                wx_id_userName: {
                    wx_id: loginWxId,
                    userName: fromId,
                },
            }
        });

    const createGroup = {
        wx_id: isRoom ? roomId : fromId,
        tg_group_id: channelId,
        group_name: title,
        is_wx_room: isRoom,
        config_id: configId,
    };

    query.then(entity => {
        // 创建群组
        prismaService.prisma.group.create({
            data: {
                ...createGroup,
                headImgUrl: isRoom ? entity?.smallHeadImgUrl : entity?.bigHeadImgUrl,
                wx_contact_id: isRoom ? null : entity?.id,
                wx_room_id: isRoom ? entity?.id : null,
            },
        }).then((res) => {
            // 将群组添加到文件夹
            addToFolder(Number(res.tg_group_id)).then(() => {
                // 检查并上传头像
                const headImgUrl = isRoom ? entity?.smallHeadImgUrl : entity?.bigHeadImgUrl;
                updateGroupHeadImg(headImgUrl, channelId).then();
            })
            resolve(res);
        })
    }).catch(err => {
        LogUtils.error('Error in creating group or fetching entity:', err);
    });
}

export async function addToFolder(chatId: number) {
    const tgUserClient = container.resolve(TgClient)
    tgUserClient.bot?.invoke(new Api.messages.GetDialogFilters()).then(result => {
        const dialogFilter: Api.TypeDialogFilter = result?.filters.find(it => {
            return it instanceof Api.DialogFilter && it.title === TgClient.DIALOG_TITLE
        })

        tgUserClient.bot?.getInputEntity(chatId).then(entity => {
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
                    tgUserClient.bot?.invoke(new Api.messages.UpdateDialogFilter({
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

export async function updateGroupHeadImg(imageUrl: string, chatId: number) {
    const tgUserClient = container.resolve(TgClient)
    if (imageUrl) {
        return FileUtils.downloadBuffer(imageUrl).then(file => {
            tgUserClient.bot.uploadFile({
                file: new CustomFile('avatar.jpg', file.length, null, file),
                workers: 2,
            }).then(photo => {
                // channel
                if (chatId.toString().startsWith('-100')) {
                    tgUserClient.bot.invoke(new Api.channels.EditPhoto({
                        channel: chatId,
                        photo: new Api.InputChatUploadedPhoto({
                            file: photo,
                        })
                    })).then()
                } else { // normal chat
                    tgUserClient.bot.invoke(
                        new Api.messages.EditChatPhoto({
                            chatId: returnBigInt(-chatId),
                            photo: new Api.InputChatUploadedPhoto({
                                file: photo,
                            })
                        })
                    ).then()
                }
            })
        })
    }
}

export async function updateGroupTitle(title: string, chatId: number) {
    const tgUserClient = container.resolve(TgClient)

    if (chatId.toString().startsWith('-100')) {
        return tgUserClient.bot.invoke(
            new Api.channels.EditTitle({
                channel: chatId,
                title: title,
            })
        ).then(e => {
            LogUtils.warn('update group title error: %s', e)
        })
    } else {
        return tgUserClient.bot.invoke(
            new Api.messages.EditChatTitle({
                chatId: returnBigInt(-chatId),
                title: title,
            })
        ).then()
    }

}