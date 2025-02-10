import {Singleton} from "../base/IService";
import {Message} from "gewechaty";
import PrismaService from "./PrismaService";
import TgClient from "../client/TgClient";
import {Api} from "telegram";
import BotClient from "../client/BotClient";
import type { group } from '@prisma/client'

export default class WxMessageHelper extends Singleton<WxMessageHelper> {

    private prismaService = PrismaService.getInstance(PrismaService);

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
                    contact.alias().then(alias => {
                        if (alias) {
                            resolve(alias)
                        } else {
                            resolve(contact.name())
                        }
                    })
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
        return new Promise((resolve, reject) => {
            this.prismaService.prisma.group.findFirst({
                where: {wx_id: wxId}
            }).then(async existGroup => {
                if (!existGroup) {
                    const tgUserBot = TgClient.getInstance().bot
                    const config = await this.prismaService.getConfigByToken()
                    const title = await this.getTitle(msg) || 'wx2tg_未命名群组';
                    tgUserBot?.invoke(
                        new Api.messages.CreateChat({
                            users: [Number(config.bot_chat_id), BotClient.getInstance().bot.botInfo.id],
                            title: title,
                            ttlPeriod: 0
                        })
                    ).then(result => {
                        this.logInfo('createGroup result : %s', JSON.stringify(result.toJSON()))
                        // @ts-ignore
                        const groupId = result?.chats[0].id;
                        const createGroup = {
                            wx_id: wxId,
                            tg_group_id: groupId,
                            group_name: title,
                        };
                        this.prismaService.prisma.group.create({
                            data: createGroup
                        }).then((res) => {
                            resolve(res)
                        })
                    })
                }
                resolve(existGroup)
            }).catch(e => {
                reject(e)
            })
        })

    }

}