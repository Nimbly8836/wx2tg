// 新的公共函数
import FileUtils from "../util/FileUtils";
import {CustomFile} from "telegram/client/uploads";
import {Api} from "telegram";
import {Message} from "gewechaty";
import {LogUtils} from "../util/LogUtils";
import PrismaService from "./PrismaService";
import WxMessageHelper from "./WxMessageHelper";
import TgClient from "../client/TgClient";
import {BigInteger} from "big-integer";
import {returnBigInt} from "telegram/Helpers";

export function createGroupWithHeadImg(wxMsg: Message, title: string, channelId: number, configId: number,resolve: Function) {
    // 选择查询表格
    const prismaService = PrismaService.getInstance(PrismaService);
    const query = wxMsg.isRoom ?
        prismaService.prisma.wx_room.findUnique({
            where: {
                wx_id_chatroomId: {
                    wx_id: wxMsg.wxid,
                    chatroomId: wxMsg.roomId,
                },
            }
        }) :
        prismaService.prisma.wx_contact.findUnique({
            where: {
                wx_id_userName: {
                    wx_id: wxMsg.wxid,
                    userName: wxMsg.fromId,
                },
            }
        });

    const createGroup = {
        wx_id: wxMsg.isRoom ? wxMsg.roomId : wxMsg.fromId,
        tg_group_id: channelId,
        group_name: title,
        is_wx_room: wxMsg.isRoom,
        config_id: configId,
    };

    query.then(entity => {
        // 创建群组
        prismaService.prisma.group.create({
            data: {
                ...createGroup,
                headImgUrl: wxMsg.isRoom ? entity?.smallHeadImgUrl : entity?.bigHeadImgUrl,
                wx_contact_id: wxMsg.isRoom ? null : entity?.id,
                wx_room_id: wxMsg.isRoom ? entity?.id : null,
            },
        }).then((res) => {
            // 将群组添加到文件夹
            addToFolder(Number(res.tg_group_id)).then(() => {
                // 检查并上传头像
                const headImgUrl = wxMsg.isRoom ? entity?.smallHeadImgUrl : entity?.bigHeadImgUrl;
                updateGroupHeadImg(headImgUrl, channelId);
            })
            resolve(res);
        })
    }).catch(err => {
        LogUtils.error('Error in creating group or fetching entity:', err);
    });
}

export async function addToFolder(chatId: number) {
    const tgUserClient = TgClient.getInstance();
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
    const tgUserClient = TgClient.getInstance();
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
                            chatId: returnBigInt(chatId),
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
    const tgUserClient = TgClient.getInstance();

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
                chatId: returnBigInt(chatId),
                title: title,
            })
        ).then()
    }

}