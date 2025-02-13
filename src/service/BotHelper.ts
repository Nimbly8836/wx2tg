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
import {wx_contact} from "@prisma/client";
import * as fs from "node:fs";
import {message} from "telegraf/filters";
import {LogUtils} from "../util/LogUtils";

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
        ]

        bot.telegram.setMyCommands(commands)
    }

    public onCommand(bot: Telegraf) {
        this.onUse(bot)
        bot.command('help', (ctx) => {
            ctx.reply('help')
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
            if (fs.existsSync('ds.json')) {
                fs.unlinkSync('ds.json');
            }
            ctx.reply('成功')
        })

        this.user(bot)
        // 分页初始化
        initPaginationCallback(bot)
    }

    public onUse(bot: Telegraf) {
        const geweBot = WxClient.getInstance().bot;
        // bot.use(async (ctx, next) => {
        //
        // })

        bot.on(message('text'), async ctx => {
            const text = ctx.message.text;
            LogUtils.debug('text : %s', text)
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

    private async user(bot: Telegraf) {
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
                callbackData: `clickUser:${item.id}`
            }
        }

        registerPagination('USER', fetchUserData, renderUserButton)

        bot.command('user', async (ctx) => {
            const queryUser = ctx.args?.[0] || ''
            await sendPagedList(ctx, 'USER', {
                pageNo: 1,
                pageSize: 12,
                columns: 3
            }, {
                keyword: queryUser,
            })
        })

        bot.action(/^clickUser:(.*)$/, async (ctx) => {
            const userId = ctx.match[1]
            await ctx.reply(`你点击了用户 ID = ${userId}`)
            await ctx.answerCbQuery()
        })
    }

}