import {Telegraf} from "telegraf";
import {Singleton} from "../base/IService";
import {MessageService} from "./MessageService";
import {ClientEnum} from "../constant/ClientConstants";
import {SimpleClientFactory} from "../base/Factory";
import PrismaService from "./PrismaService";
import {ConfigEnv} from "../config/Config";
import TgClient from "../client/TgClient";
import {WxClient} from "../client/WxClient";
import {initPaginationCallback, PagedResult, registerPagination, sendPagedList} from "../util/PageHelper";
import {wx_contact, wx_room} from "@prisma/client";
import * as fs from "node:fs";
import {message} from "telegraf/filters";
import {LogUtils} from "../util/LogUtils";
import {Constants} from "../constant/Constants";
import {defaultSetting, getButtons, SettingType} from "../util/SettingUtils";
import {updateGroupHeadImg, updateGroupTitle} from "./UserClientHelper";
import {RoomMemberType} from "../entity/Contact";
import {WxFileClient} from "../client/WxFileClient";
import {forward} from "../util/GewePostUtils";
import path, {join} from "node:path";
import {MsgType} from "../base/IMessage";
import {DownloadMediaInterface} from "telegram/client/downloads";
import {TgMessageUtils} from "../util/TgMessageUtils";

export default class BotHelper extends Singleton<BotHelper> {

    private prismaService = PrismaService.getInstance(PrismaService);
    private wxClient = WxClient.getInstance();
    private wxFileClient = WxFileClient.getInstance();
    private tgClient = TgClient.getInstance();
    private messageService = MessageService.getInstance(MessageService);

    constructor() {
        super();
    }

    public setCommands(bot: Telegraf): void {
        const commands = [
            {command: 'start', description: '开始，登陆 TG User Client'},
            {command: 'help', description: '帮助信息'},
            {command: 'setting', description: '设置'},
            {command: 'login', description: '登录微信'},
            {command: 'logout', description: '登出微信'},
            {command: 'rmds', description: '删除微信登录的缓存文件'},
            {command: 'user', description: '查看联系人，支持昵称、备注、全缩写大写、小写全拼查询'},
            {command: 'room', description: '查看群组，支持昵称和备注查询'},
            {command: 'roomml', description: '查看群组成员'},
            {command: 'sync', description: '同步群组/联系人信息'},
            {command: 'info', description: '查看当前群信息'},
            {command: 'check', description: '检查微信是否在线'},
            {command: 'sc', description: '搜索聊天记录内容'},
        ]

        bot.telegram.setMyCommands(commands)
    }

    public filterOwner(bot: Telegraf) {
        bot.use(async (ctx, next) => {
            // return next()
            const ownerId = ConfigEnv.OWNER_ID;

            if (!ownerId) {
                return;
            }

            // 群聊中命令@机器人不能使用help
            if (ctx?.text === '/help') {
                return next();
            }

            if (ctx.chat?.id !== ownerId &&
                ctx.message?.from.id !== ownerId &&
                ctx.callbackQuery?.from.id !== ownerId) {
                if (ctx.callbackQuery) {
                    ctx.answerCbQuery('你没有权限')
                }
                return
            }

            return next()

        });
    }

    public onCommand(bot: Telegraf) {
        bot.help(ctx => {
            ctx.reply(`
<strong>欢迎使用 Wx2Tg Bot</strong>

<a href="https://github.com/Nimbly8836/wx2tg">本项目</a>是一个转发微信消息到 TG 的小工具
<strong>仅用于技术研究和学习，不得用于非法用途</strong>

<strong>第一次使用</strong>
/start 开始登陆 TG User Client
/login 登陆微信

<strong>常用命令</strong>
/user 搜索微信联系人，支持昵称、备注,及其全缩写的大写和小写的全拼
/room 搜索群组，同上
/sc 搜索聊天记录内容

更多功能请查看 GitHub`, {
                parse_mode: 'HTML',
            })
        })

        bot.command('start', (ctx) => {
            const config = this.prismaService.config()
            config.findFirst({where: {bot_chat_id: ctx.chat.id}})
                .then(r => {
                    if (!r) {
                        config.create({
                            data: {
                                bot_chat_id: ctx.chat.id,
                                bot_token: ConfigEnv.BOT_TOKEN,
                                login_wxid: '',
                                setting: defaultSetting
                            }
                        }).then(() => {
                            TgClient.getInstance().login().then(r => {
                                if (r) {
                                    ctx.reply('Tg 登陆成功')
                                }
                            })
                        }).catch(e => {
                            ctx.reply('应用启动失败')
                        })
                    } else {
                        // 没有设置选项插入默认的
                        if (!r.setting) {
                            config.update({
                                where: {id: r.id},
                                data: {
                                    setting: defaultSetting
                                }
                            }).then()
                        }
                        if (!r?.tg_login) {
                            TgClient.getInstance().login().then(r => {
                                if (r) {
                                    ctx.reply('Tg 登陆成功')
                                }
                            })
                        }
                    }
                })
        })

        bot.command('login', (ctx) => {
            let WxClient = SimpleClientFactory.getSingletonClient(ClientEnum.WX_BOT) as WxClient;
            WxClient.login().then(r => {
                ctx.reply(r ? '登陆成功' : '登陆失败')
            })
        })

        bot.command('rmds', (ctx) => {
            // 删除 ds.json 文件
            if (fs.existsSync(`${Constants.GEWE_DS}`)) {
                fs.unlinkSync(`${Constants.GEWE_DS}`)
            }
            ctx.reply('成功')
        })

        bot.command('info', async (ctx) => {
            this.prismaService.prisma.group.findUnique({
                where: {
                    tg_group_id: ctx.chat.id
                },
            }).then(g => {
                if (g?.is_wx_room) {
                    this.prismaService.prisma.wx_room.findUnique({
                        where: {id: g?.wx_room_id}
                    }).then(room => {
                        // const memberList = room.memberList
                        room.memberList = ''
                        ctx.reply(`群信息: <pre><code class="language-json">${JSON.stringify(room, null, 2)}</code></pre>
                                        查看成员使用 /roomml `, {
                            parse_mode: 'HTML',
                        })
                    })
                } else {
                    this.prismaService.prisma.wx_contact.findUnique({
                        where: {id: g?.wx_contact_id}
                    }).then(contact => {
                        ctx.reply(`联系人信息：<pre><code class="language-json">${JSON.stringify(contact, null, 2)}</code></pre>`, {
                            parse_mode: 'HTML'
                        })
                    })
                }
            })
        })

        bot.command('sync', async (ctx) => {
            this.prismaService.prisma.group.findUniqueOrThrow({
                where: {tg_group_id: ctx.chat.id}
            }).then((group) => {
                if (group.is_wx_room) {
                    // @ts-ignore
                    this.wxClient.bot.Room.find({id: group.wx_id}).then(findWxRoom => {
                        findWxRoom.sync().then(syncedRoom => {
                            LogUtils.debug('syncedRoom', syncedRoom)
                            this.prismaService.syncRoomDb(syncedRoom.chatroomId)
                            // 更新头像
                            if (syncedRoom.avatarImg !== group.headImgUrl) {
                                this.prismaService.prisma.group.update({
                                    where: {id: group.id},
                                    data: {
                                        headImgUrl: syncedRoom.avatarImg
                                    }
                                }).then()
                                updateGroupHeadImg(syncedRoom.avatarImg, ctx.chat.id)
                                    .then()
                            }
                            // 更新名称
                            if (syncedRoom.remark !== group.group_name && syncedRoom.name !== group.group_name) {
                                this.prismaService.prisma.group.update({
                                    where: {id: group.id},
                                    data: {
                                        group_name: syncedRoom.remark ? syncedRoom.remark : syncedRoom.name
                                    }
                                }).then()
                                updateGroupTitle(syncedRoom.remark ? syncedRoom.remark : syncedRoom.name, ctx.chat.id)
                                    .then()
                            }
                            ctx.reply('同步成功')
                        }).catch(e => {
                            LogUtils.error('syncRoom', e)
                            ctx.reply('同步失败')
                        })
                    })

                } else {
                    this.wxClient.bot.Contact.find({id: group.wx_id}).then(findWxContact => {
                        findWxContact.sync().then(syncedContact => {
                            LogUtils.debug('syncedContact', syncedContact)
                            // 更新头像
                            if (syncedContact._avatarUrl !== group.headImgUrl) {
                                this.prismaService.prisma.group.update({
                                    where: {id: group.id},
                                    data: {
                                        headImgUrl: syncedContact._avatarUrl
                                    }
                                }).then()
                                updateGroupHeadImg(syncedContact._avatarUrl, ctx.chat.id)
                                    .then()
                            }
                            // 更新名称
                            if (syncedContact._alias !== group.group_name && syncedContact._name !== group.group_name) {
                                this.prismaService.prisma.group.update({
                                    where: {id: group.id},
                                    data: {
                                        group_name: syncedContact._alias ? syncedContact._alias : syncedContact._name
                                    }
                                }).then()
                                updateGroupTitle(syncedContact._alias ? syncedContact._alias : syncedContact._name, ctx.chat.id)
                                    .then()
                            }
                            this.prismaService.syncContactDb(syncedContact._wxid)
                        }).catch(e => {
                            LogUtils.error('syncContact', e)
                            ctx.reply('同步失败')
                        })
                        ctx.reply('同步成功')
                    })
                }
            }).catch(e => {
                ctx.reply('没绑定当前群组')
                this.prismaService.createOrUpdateWxConcatAndRoom()
            })
        })

        bot.command('logout', async (ctx) => {
            this.wxClient.logout().then(r => {
                ctx.reply('微信登出成功')
            }).catch(e => {
                LogUtils.error('command logout', e)
                ctx.reply('微信登出失败')
            })
        })

        bot.command('check', ctx => {
            this.wxClient.check().then(r => {
                ctx.reply(r ? '微信在线' : '微信离线')
            })
        })

        this.setting(bot)
        this.user(bot)
        this.room(bot)
        this.sc(bot)
        this.checkRoomMember(bot)
        // 分页初始化
        initPaginationCallback(bot)
    }

    public onMessage(bot: Telegraf) {
        bot.on(message('text'), async ctx => {
            const text = ctx.message.text;
            if (text.startsWith('/')) {
                return;
            }
            this.messageService.addMessages({
                msgType: 'text',
                chatId: ctx.chat.id,
                content: text,
            }, ClientEnum.WX_BOT)
        })


        bot.on(message('document'), async ctx => {
            this.handlerFileMessages({
                chatId: ctx.chat.id,
                text: ctx.text,
                message_id: ctx.message.message_id,
                type: 'file'
            })
        })

        bot.on(message('photo'), async ctx => {
            this.handlerFileMessages({
                chatId: ctx.chat.id,
                text: ctx.text,
                message_id: ctx.message.message_id,
                type: 'file'
            })
        })

        bot.on(message('video'), async ctx => {
            this.handlerFileMessages({
                chatId: ctx.chat.id,
                text: ctx.text,
                message_id: ctx.message.message_id,
                type: 'file' // 是用文件类型发送
            })
        })

        bot.on(message('audio'), async ctx => {
            this.handlerFileMessages({
                chatId: ctx.chat.id,
                text: ctx.text,
                message_id: ctx.message.message_id,
                type: 'file' // 是用文件类型发送
            })
        })

        bot.on(message('voice'), async ctx => {
            ctx.reply('暂不支持语音消息')
        })

    }

    // 完成 Bot 设置部分
    private setting(bot: Telegraf) {
        bot.settings(ctx => {
            // 获取数据库中的设置数据
            this.prismaService.getConfigByToken().then(async config => {
                const settings = config.setting as SettingType
                let needUpdate = false
                for (let defaultSettingKey in defaultSetting) {
                    if (!settings[defaultSettingKey]) {
                        needUpdate = true
                        settings[defaultSettingKey] = defaultSetting[defaultSettingKey]
                    }
                }

                if (needUpdate) {
                    await this.prismaService.prisma.config.update({
                        where: {id: config.id},
                        data: {setting: settings}
                    })
                }

                const buttons = getButtons(settings);

                ctx.sendMessage('设置：', {
                    reply_markup: {
                        inline_keyboard: buttons,
                    },
                });
            }).catch((err) => {
                LogUtils.error("Failed to get config by token", err);
            });
        });

        // 监听设置按钮

        bot.action(/^setting:(.*)$/, async (ctx) => {
            const settingKey = ctx.match[1];
            this.prismaService.getConfigByToken().then(async config => {
                const settings = config.setting as SettingType;

                // 切换设置
                settings[settingKey] = !settings[settingKey];

                // 更新数据库
                this.prismaService.config().update({
                    where: {id: config.id},
                    data: {setting: settings}
                }).then()

                // 更新按钮
                const buttons = getButtons(settings);

                ctx.editMessageReplyMarkup({
                    inline_keyboard: buttons,
                });

                ctx.answerCbQuery();
            })

        })

    }

    private user(bot: Telegraf) {
        const fetchUserData = async (
            pageNo: number,
            pageSize: number,
            queryParams: Record<string, any>
        ): Promise<PagedResult<any>> => {
            const skip = (pageNo - 1) * pageSize
            const take = pageSize
            const keyword = queryParams?.keyword || ''

            return new Promise(async resolve => {
                this.prismaService.countWxContact(keyword).then(total => {
                    this.prismaService.pageWxContact(keyword, take, skip)
                        .then(data => {
                            resolve({data, total})
                        }).catch(e => {
                        LogUtils.error('fetchUserData', e)
                        resolve({data: [], total: 0})
                    })
                }).catch(e => {
                    LogUtils.error('fetchUserData', e)
                    resolve({data: [], total: 0})
                })
            })

        }

        const renderUserButton = (
            item: wx_contact,
            index: number,
            pageNo: number,
            pageSize: number
        ) => {
            return {
                text: item.remark ?? item.nickName ?? '无昵称',
                callbackData: `clickUser:${item.userName}`
            }
        }

        registerPagination('USER', fetchUserData, renderUserButton)

        bot.command('user', async (ctx) => {
            const queryUser = ctx.args?.[0] || ''
            sendPagedList(ctx, 'USER', {
                pageNo: 1,
                pageSize: 12,
                columns: 3
            }, {
                keyword: queryUser,
            }).then()
        })

        bot.action(/^clickUser:(.*)$/, async (ctx) => {
            const userName = ctx.match[1]
            ctx.reply(`你点击了用户 wx_id = ${userName}`)
            // ctx.
            ctx.answerCbQuery()
        })
    }

    private room(bot: Telegraf) {
        const fetchRoomData = async (
            pageNo: number,
            pageSize: number,
            queryParams: Record<string, any>
        ): Promise<PagedResult<any>> => {
            const skip = (pageNo - 1) * pageSize
            const take = pageSize
            const keyword = queryParams?.keyword || ''

            return new Promise<PagedResult<any>>(resolve => {
                this.prismaService.countWxRoom(keyword).then(total => {
                    this.prismaService.pageWxRoom(keyword, take, skip).then(data => {
                        resolve({data, total})
                    }).catch(e => {
                        LogUtils.error('fetchRoomData', e)
                        resolve({data: [], total: 0})
                    })
                }).catch(e => {
                    LogUtils.error('fetchRoomData', e)
                    resolve({data: [], total: 0})
                })
            })

        }

        const renderRoomButton = (
            item: wx_room,
            index: number,
            pageNo: number,
            pageSize: number
        ) => {
            return {
                text: item.remark ?? item.nickName ?? '无昵称',
                callbackData: `clickRoom:${item.chatroomId}`
            }
        }

        registerPagination('ROOM', fetchRoomData, renderRoomButton)

        bot.command('room', async (ctx) => {
            const queryUser = ctx.args?.[0] || ''
            sendPagedList(ctx, 'ROOM', {
                pageNo: 1,
                pageSize: 12,
                columns: 3
            }, {
                keyword: queryUser,
            })
        })

        bot.action(/^clickRoom:(.*)$/, async (ctx) => {
            const chatroomId = ctx.match[1]
            ctx.reply(`你点击了chatroomId = ${chatroomId}`)
            ctx.answerCbQuery()
        })
    }

    private sc(bot: Telegraf) {
        const fetchScData = async (
            pageNo: number,
            pageSize: number,
            queryParams: Record<string, any>
        ): Promise<PagedResult<any>> => {
            const skip = (pageNo - 1) * pageSize
            const take = pageSize
            const keyword = queryParams?.keyword
            const groupId = queryParams?.groupId


            return new Promise<PagedResult<any>>(resolve => {
                if (!keyword) {
                    return resolve({data: [], total: 0})
                }
                this.prismaService.countMessageContent(keyword, groupId).then(total => {
                    this.prismaService.pageMessageContent(keyword, take, skip, groupId).then(data => {
                        resolve({data, total})
                    }).catch(e => {
                        LogUtils.error('fetchScData', e)
                        resolve({data: [], total: 0})
                    })
                }).catch(e => {
                    LogUtils.error('fetchScData', e)
                    resolve({data: [], total: 0})
                })
            })
        }

        const renderScButton = (
            item: any, // dbMessage
            index: number,
            pageNo: number,
            pageSize: number
        ) => {
            return {
                text: item.wx_msg_user_name + '：' + item.content,
                callbackData: '',
                url: `https://t.me/c/${item.group?.tg_group_id.toString().slice(4)}/${item.tg_msg_id}`,
            }
        }

        registerPagination('SC', fetchScData, renderScButton)

        bot.command('sc', async (ctx) => {
            let queryWords = ctx.args?.[0];
            let groupId

            // if (ctx.chat?.id) {
            const group = await this.prismaService.prisma.group.findUnique({
                where: {
                    tg_group_id: ctx.chat.id
                }
            })
            if (group) {
                groupId = group.id
            }


            if (!queryWords) {
                await ctx.reply('请使用 \'/sc 关键词\' 搜索');
            } else {
                // @ts-ignore
                ctx.session.SCextraData = {
                    keyword: queryWords,
                    groupId: groupId
                }

                sendPagedList(ctx, 'SC', {
                    pageNo: 1,
                    pageSize: 10,
                    columns: 1
                }, {
                    keyword: queryWords,
                    groupId: groupId
                }).then();
            }
        });

    }

    private checkRoomMember(bot: Telegraf) {
        let currentMemberList: any[] = []
        let chatId: number
        const fetchScData = async (
            pageNo: number,
            pageSize: number,
            queryParams: Record<string, any>
        ): Promise<PagedResult<any>> => {
            const skip = (pageNo - 1) * pageSize
            const endIndex = pageSize * pageNo
            const keyword = queryParams?.keyword
            chatId = queryParams?.chatId ? queryParams?.chatId : chatId


            return new Promise<PagedResult<any>>(resolve => {
                if (chatId) {
                    this.prismaService.prisma.group.findUnique({
                        where: {tg_group_id: chatId}
                    }).then(g => {
                        if (g?.is_wx_room) {
                            this.prismaService.prisma.wx_room.findUnique({
                                where: {id: g?.wx_room_id}
                            }).then(room => {
                                let memberList = JSON.parse(room.memberList) as RoomMemberType[];
                                if (keyword) {
                                    memberList = memberList.filter(m => m.nickName?.includes(keyword) || m.displayName?.includes(keyword))
                                }
                                const data = memberList.slice(skip, endIndex)
                                currentMemberList = data
                                resolve({data, total: memberList.length})
                            })
                        } else {
                            resolve({data: [], total: 0})
                        }
                    })
                } else {
                    resolve({data: [], total: 0})
                }
            })

        }

        const renderScButton = (
            item: RoomMemberType,
            index: number,
            pageNo: number,
            pageSize: number
        ) => {
            const text = item.displayName ? item.displayName + '(' + item.nickName + ')' : item.nickName
            return {
                text: text,
                callbackData: `clickRoomml:${item.wxid}`,
            }
        }

        registerPagination('ROOM_MEMBER', fetchScData, renderScButton, true)

        bot.command('roomml', async (ctx) => {
            const queryUser = ctx.args?.[0] || ''
            sendPagedList(ctx, 'ROOM_MEMBER', {
                pageNo: 1,
                pageSize: 10,
                columns: 1
            }, {
                keyword: queryUser,
                chatId: ctx.chat.id,
                msgId: null
            }).then(res => {
                LogUtils.debug(res)
            })
        })

        bot.action(/^clickRoomml:(.*)$/, async (ctx) => {
            const wxid = ctx.match[1]
            const member: RoomMemberType = currentMemberList.find(m => m.wxid === wxid)
            ctx.reply(`${member.nickName}信息：
<pre><code class="language-json">${JSON.stringify(member, null, 2)}</code></pre>`, {parse_mode: 'HTML'})
            ctx.answerCbQuery()
        })
    }

    public onAction(bot: Telegraf) {
        bot.action(/^download:(.*)$/, async ctx => {
            // 检查是否有登陆微信文件助手
            if (!this.wxFileClient.hasLogin) {
                this.wxFileClient.login().then(() => {
                })
                ctx.reply('请先登陆微信文件助手，然后重新点击下载')
                ctx.answerCbQuery()
            } else {
                const wxMsgId = ctx.match[1]
                this.prismaService.getConfigByToken().then(config => {
                    this.prismaService.prisma.message.findFirst({
                        where: {
                            wx_msg_id: wxMsgId,
                        }
                    }).then(msg => {
                        forward(msg.wx_msg_text, Constants.FILE_HELPER, msg.wx_msg_type_text)
                            .then(res => {
                                // 更新 msg 设置转发的id
                                LogUtils.debug('forward file message', res)
                                this.prismaService.prisma.message.update({
                                    where: {id: msg.id},
                                    data: {
                                        // @ts-ignore
                                        wx_hp_msg_id: res.newMsgId.toString()
                                    }
                                }).then(() => {

                                })
                                ctx.answerCbQuery('正在下载文件，请稍后')
                            }).catch(e => {
                            LogUtils.error('forward file message', e)
                            ctx.answerCbQuery('文件转发失败')
                        })
                    })
                })
            }
        })
    }

    handlerFileMessages(sendParams: {
        chatId: number,
        text: string,
        message_id: number,
        type?: string,
    }) {
        const {chatId, text, message_id, type} = sendParams
        // 是自己发送的不处理
        if (TgMessageUtils.popMessage(chatId, message_id)) {
            return
        }
        if (text) {
            this.messageService.addMessages({
                msgType: 'text',
                chatId: chatId,
                content: text,
            }, ClientEnum.WX_BOT)
        }
        let msgType: MsgType = 'file'
        let downloadParams: DownloadMediaInterface = {}
        this.tgClient.bot.getMessages(chatId, {ids: [message_id]})
            .then(msgs => {
                msgs.forEach(msg => {
                    msg.downloadMedia(downloadParams)
                        .then(file => {
                            this.wxClient.sendMessage({
                                msgType: msgType,
                                chatId: chatId,
                                content: '',
                                file: file,
                                fileName: msg.file.name,
                            }).then()
                        })
                })
            })
    }
}