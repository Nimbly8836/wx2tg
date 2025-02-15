import {Telegraf} from "telegraf";
import {AbstractService, Singleton} from "../base/IService";
import {SendMessage} from "../base/IMessage";
import {MessageService} from "./MessageService";
import {ClientEnum} from "../constant/ClientConstants";
import {SimpleClientFactory} from "../base/Factory";
import PrismaService from "./PrismaService";
import {ConfigEnv} from "../config/Config";
import TgClient from "../client/TgClient";
import {WxClient} from "../client/WxClient";
import {initPaginationCallback, PagedResult, registerPagination, sendPagedList} from "../util/PageHelper";
import {wx_contact, wx_room, message as dbMessage} from "@prisma/client";
import * as fs from "node:fs";
import {message} from "telegraf/filters";
import {LogUtils} from "../util/LogUtils";
import {Constants} from "../constant/Constants";
import {Settings} from "../entity/Config";

export default class BotHelper extends Singleton<BotHelper> {

    private prismaService = PrismaService.getInstance(PrismaService);

    constructor() {
        super();
    }

    public setCommands(bot: Telegraf): void {
        const commands = [
            {command: 'help', description: '帮助'},
            {command: 'start', description: '开始'},
            {command: 'login', description: '登录'},
            {command: 'user', description: '查看联系人，支持昵称、备注、全缩写大写、小写全拼查询'},
            {command: 'room', description: '查看群组，支持昵称和备注查询'},
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
                                setting: {
                                    receivePublicMessages: false,
                                    blockStickers: false,
                                } as Settings
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
                                    setting: {
                                        receivePublicMessages: false,
                                        blockStickers: false,
                                    } as Settings
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

        this.user(bot)
        this.room(bot)
        this.sc(bot)
        // 分页初始化
        initPaginationCallback(bot)
        this.onMessage(bot)
    }

    public onMessage(bot: Telegraf) {
        const geweBot = WxClient.getInstance().bot;

        bot.on(message('text'), async ctx => {
            const text = ctx.message.text;
            if (text.startsWith('/')) {
                return;
            }
            this.prismaService.prisma.group.findUnique({
                where: {
                    tg_group_id: ctx.chat.id
                }
            }).then(r => {
                if (r?.is_wx_room) {
                    // @ts-ignore
                    geweBot.Room.find({id: r.wx_id}).then(room => {
                        room.say(text)
                    })
                } else {
                    geweBot.Contact.find({id: r.wx_id}).then(contact => {
                        contact.say(text)
                    })
                }

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

            const total = await this.prismaService.countWxContact(keyword)
            const data = await this.prismaService.pageWxContact(keyword, take, skip)

            return {data, total}
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
            })
        })

        bot.action(/^clickUser:(.*)$/, async (ctx) => {
            const userName = ctx.match[1]
            ctx.reply(`你点击了用户 wx_id = ${userName}`)
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

            const total = await this.prismaService.countWxRoom(keyword)
            const data = await this.prismaService.pageWxRoom(keyword, take, skip)

            return {data, total}
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
            const keyword = queryParams?.keyword || ''

            const total = await this.prismaService.countMessageContent(keyword)
            const data = await this.prismaService.pageMessageContent(keyword, take, skip)

            return {data, total}
        }

        const renderScButton = (
            item: any,
            index: number,
            pageNo: number,
            pageSize: number
        ) => {
            return {
                text: item.content,
                callbackData: '',
                url: `https://t.me/c/${item.group.tg_group_id.toString().slice(4)}/${item.tg_msg_id}`,
            }
        }

        registerPagination('SC', fetchScData, renderScButton)

        bot.command('sc', async (ctx) => {
            const queryUser = ctx.args?.[0] || ''
            await sendPagedList(ctx, 'SC', {
                pageNo: 1,
                pageSize: 10,
                columns: 1
            }, {
                keyword: queryUser,
            })
        })

        bot.action(/^clickSc:(.*)$/, async (ctx) => {
            const chatroomId = ctx.match[1]
            ctx.reply(`你点击了chatroomId = ${chatroomId}`)
            ctx.answerCbQuery()
        })
    }
}