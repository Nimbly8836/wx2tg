import {Markup, Telegraf} from "telegraf";
import {Singleton} from "../base/IService";
import {MessageService} from "./MessageService";
import {ClientEnum} from "../constant/ClientConstants";
import {SimpleClientFactory} from "../base/Factory";
import PrismaService from "./PrismaService";
import {ConfigEnv} from "../config/Config";
import TgClient from "../client/TgClient";
import {WxClient} from "../client/WxClient";
import {initPaginationCallback, PagedResult, registerPagination, sendPagedList} from "../util/PageHelper";
import {tg_entity, wx_contact, wx_room} from "@prisma/client";
import * as fs from "node:fs";
import {message} from "telegraf/filters";
import {Constants} from "../constant/Constants";
import {defaultSetting, getButtons, SettingType} from "../util/SettingUtils";
import {createChannel, updateGroupHeadImg, updateGroupTitle} from "./UserClientHelper";
import {RoomMemberType} from "../entity/Contact";
import {WxFileClient} from "../client/WxFileClient";
import {forward} from "../util/GewePostUtils";
import {MsgType} from "../base/IMessage";
import {DownloadMediaInterface} from "telegram/client/downloads";
import {TgMessageUtils} from "../util/TgMessageUtils";
import {Api} from "telegram/tl";
import {addToGroupIds, removeFromGroupIds} from "../util/CacheUtils";
import FileUtils from "../util/FileUtils";
import {ConverterHelper} from "../util/FfmpegUtils";

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
            {command: 'start', description: '开始，登录 TG User Client'},
            {command: 'help', description: '帮助信息'},
            {command: 'settings', description: '设置'},
            {command: 'login', description: '登录微信'},
            {command: 'logout', description: '登出微信'},
            {command: 'rmds', description: '删除微信登录的缓存文件'},
            {command: 'user', description: '查看联系人，支持昵称、备注、全缩写大写、小写全拼查询'},
            {command: 'room', description: '查看群组，支持昵称和备注查询'},
            {command: 'roomml', description: '查看群组成员信息'},
            {command: 'sync', description: '同步群组/联系人信息'},
            {command: 'info', description: '查看当前群信息'},
            {command: 'check', description: '检查微信是否在线'},
            {command: 'sc', description: '搜索聊天记录内容，在群组使用只搜索当前群组'},
            {command: 'fu', description: '强制更新群组信息（名称和头像）'},
            {command: 'sw', description: '切换当前群组转发状态'},
            {
                command: 'ala',
                description: '添加允许转发的id，在当前群组中能转发消息的id。说明请看帮助文档'
            },
            {command: 'al', description: '列出当前允许转发的实体，点击删除'},

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
                    await ctx.answerCbQuery('你没有权限')
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
/start 开始登录 TG User Client
/login 登录微信

<strong>常用命令</strong>
/user 搜索微信联系人，支持昵称、备注，及其全缩写的大写和小写的全拼
/room 搜索群组，同上
/sc 搜索聊天记录内容
user & room 命令在群组使用，能切换当前绑定的用户或者绑定当前群组
/al 命令添加允许当前群组能转发的用户的id，添加 1 是所有人都能转发，在1存在的时候可以在id前面加 - 不允许转发
如：[1, -123, -124, 125] 这时候所有的人除了 -123 -124 的消息不转发，其他人的消息都转发；没有1的时候 -id 没有意义

更多功能请查看 GitHub`, {
                parse_mode: 'HTML',
            })
        })

        bot.command('start', (ctx) => {
            if (ConfigEnv.OWNER_ID !== ctx.chat.id) {
                return
            }
            const config = this.prismaService.config()
            config.findFirst({where: {bot_token: ConfigEnv.BOT_TOKEN}})
                .then(r => {
                    if (!r) {
                        config.create({
                            data: {
                                bot_chat_id: ctx.chat.id,
                                bot_token: ConfigEnv.BOT_TOKEN,
                                setting: defaultSetting,
                                bot_id: bot.botInfo.id,
                            },
                        }).then(() => {
                            TgClient.getInstance().login().then(r => {
                                if (r) {
                                    ctx.reply('Tg 登录成功')
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
                                    ctx.reply('Tg 登录成功')
                                }
                            })
                        }
                    }
                })
        })

        bot.command('login', (ctx) => {
            let WxClient = SimpleClientFactory.getSingletonClient(ClientEnum.WX_BOT) as WxClient;
            WxClient.login().then(r => {
                ctx.reply(r ? '登录成功' : '登录失败')
            }).catch(err => {
                ctx.reply('登录失败：', err)
            })
        })

        bot.command('rmds', (ctx) => {
            // 删除 ds.json 文件
            if (fs.existsSync(`${Constants.GEWE_DS}`)) {
                fs.unlinkSync(`${Constants.GEWE_DS}`)
                // 直接标记成未登录
                this.wxClient.hasLogin = false
            }
            ctx.reply('成功')
        })

        bot.command('info', async (ctx) => {
            this.prismaService.prisma.group.findUniqueOrThrow({
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
            }).catch(() => {
                ctx.reply('当前群组未绑定')
            })
        })

        bot.command('sync', async (ctx) => {
            this.syncInfo(ctx);
        })

        bot.command('fu', async (ctx) => {
            this.syncInfo(ctx, true);
        })

        // 切换当前群组的转发状态
        bot.command('sw', async (ctx) => {
            this.prismaService.prisma.group.findUniqueOrThrow({
                where: {tg_group_id: ctx.chat.id}
            }).then(group => {
                this.prismaService.prisma.group.update({
                    where: {id: group.id},
                    data: {
                        forward: !group.forward
                    }
                }).then(() => {
                    if (group.forward) {
                        removeFromGroupIds(Number(group.tg_group_id))
                    } else {
                        addToGroupIds(Number(group.tg_group_id))
                    }
                    ctx.reply('切换成功,当前群组转发状态：' + (!group.forward ? '开启' : '关闭'))
                })
            }).catch(() => {
                ctx.reply('当前群组未绑定')
            })
        })

        bot.command('ala', async ctx => {
            this.prismaService.prisma.group.findUniqueOrThrow({
                where: {tg_group_id: ctx.chat.id}
            }).then(async group => {
                const entityLike = ctx.args;
                if (entityLike) {
                    const entities = await Promise.all(entityLike.map(async it => {
                        let entity: tg_entity;
                        if (parseInt(it) == 1) {
                            entity = {
                                user_id: BigInt(1),
                                user_name: '所有人',
                                first_name: null,
                                last_name: null,
                            };
                        } else {
                            const subFlag = it.startsWith('-');
                            it = subFlag ? it.slice(1) : it;
                            if (parseInt(it)) { // 纯id的情况
                                const entityFromUserId = await this.tgClient.bot.getEntity(it);
                                if (entityFromUserId instanceof Api.User) {
                                    entity = {
                                        user_id: BigInt(entityFromUserId.id.toJSNumber()),
                                        user_name: entityFromUserId.username,
                                        first_name: entityFromUserId.firstName,
                                        last_name: entityFromUserId.lastName,
                                    };
                                }
                            } else {
                                // @开头的去除at
                                const entityFromUserId = await this.tgClient.bot.getEntity(it.startsWith('@') ? it.slice(1) : it);
                                if (entityFromUserId instanceof Api.User) {
                                    entity = {
                                        user_id: BigInt(entityFromUserId.id.toJSNumber()),
                                        user_name: entityFromUserId.username,
                                        first_name: entityFromUserId.firstName,
                                        last_name: entityFromUserId.lastName,
                                    };
                                }
                            }
                            if (subFlag) {
                                entity.user_id = -entity.user_id;
                            }
                        }
                        return entity;
                    }));

                    entities.forEach(it => {
                        this.prismaService.prisma.tg_entity.upsert({
                            where: {
                                user_id: Math.abs(Number(it.user_id))
                            },
                            update: {
                                user_name: it.user_name,
                                first_name: it.first_name,
                                last_name: it.first_name,
                            },
                            create: {
                                ...it,
                                user_id: Math.abs(Number(it.user_id)),
                            }
                        }).then()
                    })

                    const allowIds = group.allow_ids;
                    const set = new Set(allowIds);
                    entities.forEach(it => set.add(it.user_id))
                    this.prismaService.prisma.group.update({
                        where: {id: group.id},
                        data: {
                            allow_ids: [...set]
                        }
                    }).then(() => {
                        ctx.reply('添加成功')
                    })

                }
            }).catch(() => ctx.reply('当前群组未绑定'))
        })


        bot.command('logout', async (ctx) => {
            this.wxClient.logout().then(r => {
                ctx.reply('微信登出成功')
            }).catch(e => {
                this.logError('command logout', e)
                ctx.reply('微信登出失败')
            })
        })

        bot.command('check', ctx => {
            this.wxClient.check().then(r => {
                if (r?.data) {
                    ctx.reply('微信在线')
                } else {
                    ctx.reply('微信离线')
                }
            })
        })

        this.setting(bot)
        this.user(bot)
        this.room(bot)
        this.sc(bot)
        this.checkRoomMember(bot)
        this.al(bot)
        // 分页初始化
        initPaginationCallback(bot)
    }

    public onMessage(bot: Telegraf) {
        bot.on(message('text'), async (ctx, next) => {
            const text = ctx.message.text;
            // 这是等待 TG 登录输入的消息 直接跳过
            if (this.tgClient.waitingReplyOnLogin.includes(ctx.message.message_id)) {
                return next();
            }
            // 命令跳过
            if (text.startsWith('/')) {
                return next()
            }
            this.prismaService.prisma.group.findUnique({
                where: {tg_group_id: ctx.chat.id}
            }).then(group => {
                if (!group?.forward) {
                    return next()
                }
                this.messageService.addMessages({
                    msgType: 'text',
                    chatId: ctx.chat.id,
                    tgMsgId: ctx.message.message_id,
                    content: text,
                }, ClientEnum.WX_BOT)
            })

        })

        bot.on(message('reply_to_message'), async (ctx, next) => {

        })


        bot.on(message('document'), async ctx => {
            this.handlerFileMessages({
                chatId: ctx.chat.id,
                text: ctx.text,
                message_id: ctx.message.message_id,
                tgMsgId: ctx.message.message_id,
                type: 'file',
                ctx: ctx,
            })
        })

        bot.on(message('photo'), async ctx => {
            this.handlerFileMessages({
                chatId: ctx.chat.id,
                text: ctx.text,
                message_id: ctx.message.message_id,
                tgMsgId: ctx.message.message_id,
                type: 'image',
                ctx: ctx,
            })
        })

        bot.on(message('video'), async ctx => {
            this.handlerFileMessages({
                chatId: ctx.chat.id,
                text: ctx.text,
                message_id: ctx.message.message_id,
                type: 'file', // 用文件类型发送
                tgMsgId: ctx.message.message_id,
                ctx: ctx,
            })
        })

        bot.on(message('audio'), async ctx => {
            this.handlerFileMessages({
                chatId: ctx.chat.id,
                text: ctx.text,
                message_id: ctx.message.message_id,
                type: 'file', // 用文件类型发送
                ctx: ctx,
                tgMsgId: ctx.message.message_id,
            })
        })

        bot.on(message('voice'), async ctx => {
            ctx.reply('暂不支持语音消息')
        })

        bot.on(message('sticker'), ctx => {

            if (!fs.existsSync(Constants.STICKER_PATH)) {
                fs.mkdirSync(Constants.STICKER_PATH, {recursive: true})
            }

            const fileId = ctx.message.sticker.file_id
            ctx.telegram.getFileLink(fileId).then(async fileLink => {
                const uniqueId = ctx.message.sticker.file_unique_id
                const href = fileLink.href
                const fileName = `${uniqueId}-${href.substring(href.lastIndexOf('/') + 1, href.length)}`
                const saveFile = `${Constants.STICKER_PATH}/${fileName}`
                const gifFile = `${Constants.STICKER_PATH}/${fileName.slice(0, fileName.lastIndexOf('.'))}.gif`

                const lottie_config = {
                    width: 256,
                    height: 256,
                    fps: 30,
                }

                // 微信不能发超过1Mb的gif文件
                if (saveFile.endsWith('.tgs')) {
                    lottie_config.width = 256
                    lottie_config.height = 256
                }

                const sendGif = (saveFile: string, gifFile: string, lottie_config?: {
                    width?: number,
                    height?: number
                    fps?: number
                }) => {
                    if (!fs.existsSync(gifFile)) {
                        const converterHelper = new ConverterHelper();
                        let converterToGif: Promise<void>
                        if (saveFile.endsWith('.tgs')) {
                            converterToGif = converterHelper.tgsToGif(saveFile, gifFile, lottie_config)
                        } else if (saveFile.endsWith('.webm')) {
                            converterToGif = converterHelper.webmToGif(saveFile, gifFile)
                        } else if (saveFile.endsWith('.webp')) {
                            converterToGif = converterHelper.webpToGif(saveFile, gifFile)
                        }
                        converterToGif.then(() => {
                            this.messageService.addMessages({
                                msgType: 'image',
                                chatId: ctx.chat.id,
                                tgMsgId: ctx.message.message_id,
                                content: '',
                                file: Buffer.from(fs.readFileSync(gifFile)),
                                fileName: 'sticker.gif',
                            }, ClientEnum.WX_BOT)
                        }).catch(() =>
                            ctx.reply('发送失败, 文件转换失败', {
                                reply_parameters: {
                                    message_id: ctx.message.message_id
                                }
                            }))
                    } else {
                        this.messageService.addMessages({
                            msgType: 'image',
                            chatId: ctx.chat.id,
                            tgMsgId: ctx.message.message_id,
                            content: '',
                            file: Buffer.from(fs.readFileSync(gifFile)),
                            fileName: 'sticker.gif',
                        }, ClientEnum.WX_BOT)
                    }
                }

                // gif 文件存在
                if (fs.existsSync(gifFile)) {
                    sendGif(saveFile, gifFile, lottie_config)
                } else if (!fs.existsSync(saveFile)) {
                    FileUtils.downloadFile(fileLink.toString(), saveFile, true)
                        .then(() => {
                            sendGif(saveFile, gifFile, lottie_config)
                        }).catch(() =>
                        ctx.reply('发送失败', {
                            reply_parameters: {
                                message_id: ctx.message.message_id
                            }
                        }))
                } else {
                    sendGif(saveFile, gifFile, lottie_config)
                }
            }).catch(e => {
                ctx.reply('发送失败', {
                    reply_parameters: {
                        message_id: ctx.message.message_id
                    }
                })
            })
        })

    }

    // 完成 Bot 设置部分
    private setting(bot: Telegraf) {
        bot.settings(ctx => {
            // 获取数据库中的设置数据
            this.prismaService.getConfigCurrentLoginWxAndToken().then(async config => {
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
                this.logError("Failed to get config by token", err);
            });
        });

        // 监听设置按钮

        bot.action(/^setting:(.*)$/, async (ctx) => {
            const settingKey = ctx.match[1];
            this.prismaService.getConfigCurrentLoginWxAndToken().then(async config => {
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
                        this.logError('fetchUserData', e)
                        resolve({data: [], total: 0})
                    })
                }).catch(e => {
                    this.logError('fetchUserData', e)
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

        registerPagination('USER', fetchUserData, renderUserButton, true)

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
            // bot 里面根据是否存在创建群组
            const userName = ctx.match[1]
            this.prismaService.getConfigCurrentLoginWxAndToken().then(config => {
                // 在 bot 的聊天内去创建群组
                if (ctx.chat.id == Number(config.bot_chat_id)) {
                    this.prismaService.prisma.group.findFirst({
                        where: {
                            config_id: config.id,
                            wx_id: userName
                        }
                    }).then(group => {
                        if (group) {
                            return ctx.answerCbQuery('已存在该群组')
                        } else {
                            this.prismaService.prisma.wx_contact.findUniqueOrThrow({
                                where: {
                                    wx_id_userName: {
                                        wx_id: config.login_wxid,
                                        userName: userName
                                    }
                                }
                            }).then(user => {
                                const title = user.remark ?? user.nickName ?? `用户${user.userName}`
                                const createGroupParams = {
                                    isRoom: false,
                                    loginWxId: config.login_wxid,
                                    roomId: '',
                                    fromId: userName,
                                    configId: config.id,
                                    channelId: 0,
                                    title: title,
                                }
                                createChannel(
                                    createGroupParams,
                                    [Number(config.bot_chat_id), Number(config.bot_id)],
                                    () => {
                                        ctx.answerCbQuery('创建成功')
                                    })
                            }).catch((reason) => {
                                this.logDebug('clickUser 不存在', reason)
                                ctx.answerCbQuery('用户不存在')
                            })
                        }
                    })
                } else {
                    // 更新绑定
                    this.prismaService.getConfigCurrentLoginWxAndToken().then(config => {
                        // 查询用户表
                        this.prismaService.prisma.wx_contact.findUniqueOrThrow({
                            where: {
                                wx_id_userName: {
                                    wx_id: config.login_wxid,
                                    userName: userName
                                }
                            }
                        }).then(user => {
                            const groupName = user.remark ?? user.nickName ?? `用户-${user.userName}`;
                            this.prismaService.prisma.group.upsert({
                                create: {
                                    tg_group_id: ctx.chat.id,
                                    wx_id: userName,
                                    is_wx_room: false,
                                    wx_contact_id: user.id,
                                    group_name: groupName,
                                    config_id: config.id,
                                    headImgUrl: user.bigHeadImgUrl,
                                },
                                update: {
                                    tg_group_id: ctx.chat.id,
                                    wx_id: userName,
                                    is_wx_room: false,
                                    wx_contact_id: user.id,
                                    group_name: groupName,
                                    headImgUrl: user.bigHeadImgUrl,
                                },
                                where: {
                                    tg_group_id: ctx.chat.id
                                }
                            }).then(() => {
                                // 更新那个群的名称和头像
                                updateGroupTitle(groupName, ctx.chat.id)
                                updateGroupHeadImg(user.bigHeadImgUrl, ctx.chat.id)
                                ctx.answerCbQuery('绑定成功')
                            }).catch((reason) => {
                                // 已经绑定了其他的群组
                                this.logInfo('clickUser 已经绑定了其他群组', reason)
                                ctx.answerCbQuery('该用户已经绑定了其他群组')
                            })
                        }).catch((reason) => {
                            this.logInfo('clickUser 不存在', reason)
                            ctx.answerCbQuery('用户不存在')
                        })


                    })
                }
            })
            // ctx.answerCbQuery()
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
                        this.logError('fetchRoomData', e)
                        resolve({data: [], total: 0})
                    })
                }).catch(e => {
                    this.logError('fetchRoomData', e)
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

        registerPagination('ROOM', fetchRoomData, renderRoomButton, true)

        bot.command('room', async (ctx) => {
            const queryUser = ctx.args?.[0] || ''
            sendPagedList(ctx, 'ROOM', {
                pageNo: 1,
                pageSize: 12,
                columns: 3
            }, {
                keyword: queryUser,
            }).then()
        })

        bot.action(/^clickRoom:(.*)$/, async (ctx) => {
            const chatroomId = ctx.match[1]
            this.prismaService.getConfigCurrentLoginWxAndToken().then(config => {
                // 在 bot 的聊天内去创建群组
                if (ctx.chat.id == Number(config.bot_chat_id)) {
                    this.prismaService.prisma.group.findFirst({
                        where: {
                            config_id: config.id,
                            wx_id: chatroomId
                        }
                    }).then(group => {
                        if (group) {
                            return ctx.answerCbQuery('已存在该群组')
                        } else {
                            this.prismaService.prisma.wx_room.findUniqueOrThrow({
                                where: {
                                    wx_id_chatroomId: {
                                        wx_id: config.login_wxid,
                                        chatroomId: chatroomId
                                    }
                                }
                            }).then(room => {
                                const title = room.remark ?? room.nickName ?? `群组-${room.chatroomId}`
                                const createGroupParams = {
                                    isRoom: false,
                                    loginWxId: config.login_wxid,
                                    roomId: chatroomId,
                                    fromId: '',
                                    configId: config.id,
                                    channelId: 0,
                                    title: title,
                                }
                                createChannel(
                                    createGroupParams,
                                    [Number(config.bot_chat_id), Number(config.bot_id)],
                                    () => {
                                        ctx.answerCbQuery('创建成功')
                                    })
                            }).catch(() => {
                                ctx.answerCbQuery('群组不存在')
                            })
                        }
                    })
                } else {
                    // 更新绑定
                    this.prismaService.getConfigCurrentLoginWxAndToken().then(config => {
                        // 查询用户表
                        this.prismaService.prisma.wx_room.findUniqueOrThrow({
                            where: {
                                wx_id_chatroomId: {
                                    wx_id: config.login_wxid,
                                    chatroomId: chatroomId
                                }
                            }
                        }).then(room => {
                            const groupName = room.remark ?? room.nickName ?? `群组-${room.chatroomId}`;
                            this.prismaService.prisma.group.upsert({
                                create: {
                                    tg_group_id: ctx.chat.id,
                                    wx_id: chatroomId,
                                    is_wx_room: true,
                                    wx_room_id: room.id,
                                    group_name: groupName,
                                    config_id: config.id,
                                    headImgUrl: room.smallHeadImgUrl,
                                },
                                update: {
                                    tg_group_id: ctx.chat.id,
                                    wx_id: chatroomId,
                                    is_wx_room: true,
                                    wx_room_id: room.id,
                                    group_name: groupName,
                                    config_id: config.id,
                                    headImgUrl: room.smallHeadImgUrl,
                                },
                                where: {
                                    tg_group_id: ctx.chat.id
                                }
                            }).then(() => {
                                // 更新那个群的名称和头像
                                updateGroupTitle(groupName, ctx.chat.id)
                                updateGroupHeadImg(room.chatroomId, ctx.chat.id)
                                ctx.answerCbQuery('绑定成功')
                            }).catch((reason) => {
                                // 已经绑定了其他的群组
                                this.logInfo('clickRoom 已经绑定了其他群组', reason)
                                ctx.answerCbQuery('该群组已经绑定了其他群组')
                            })
                        }).catch((reason) => {
                            this.logInfo('clickRoom 不存在', reason)
                            ctx.answerCbQuery('群组不存在')
                        })


                    })
                }
            })
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
                        this.logError('fetchScData', e)
                        resolve({data: [], total: 0})
                    })
                }).catch(e => {
                    this.logError('fetchScData', e)
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

        registerPagination('SC', fetchScData, renderScButton, true)

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
                this.logDebug(res)
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

    /**
     * 列出当前群组内的转发的实体
     * */
    private al(bot: Telegraf) {
        let currentUserList: tg_entity[] = []
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
                    this.prismaService.prisma.group.findUniqueOrThrow({
                        where: {tg_group_id: chatId}
                    }).then(g => {
                        // 都是正的
                        const allowIds: bigint[] = []
                        for (let allowId of g.allow_ids) {
                            allowIds.push(BigInt(Math.abs(Number(allowId))))
                        }
                        this.prismaService.prisma.tg_entity.findMany({
                            where: {
                                user_id: {
                                    in: allowIds
                                },
                                OR: [
                                    {user_name: {contains: keyword}},
                                    {first_name: {contains: keyword}},
                                    {last_name: {contains: keyword}}
                                ]
                            }, orderBy: {user_id: 'asc'}
                        }).then(users => {
                            users.forEach(it => {
                                // 这里是存的 -id 的情况
                                if (!g.allow_ids.includes(it.user_id)) {
                                    it.user_id = -it.user_id
                                }
                            })
                            const data = users.slice(skip, endIndex)
                            currentUserList = data
                            resolve({data, total: currentUserList.length})
                        })
                    })
                } else {
                    resolve({data: [], total: 0})
                }
            })

        }

        const renderScButton = (
            item: any,
            index: number,
            pageNo: number,
            pageSize: number
        ) => {
            let text = item.user_name ?? item.first_name ?? item.last_name ?? item.user_id
            if (item.user_id < 0) {
                text = '不能转发：' + text
            }
            return {
                text: text,
                callbackData: `clickAl:${item.user_id}`,
            }
        }

        registerPagination('AL', fetchScData, renderScButton, true)

        bot.command('al', async (ctx) => {
            const queryUser = ctx.args?.[0] || ''
            sendPagedList(ctx, 'AL', {
                pageNo: 1,
                pageSize: 10,
                columns: 1
            }, {
                keyword: queryUser,
                chatId: ctx.chat.id,
                msgId: null
            }).then(res => {
                this.logDebug(res)
            })
        })

        bot.action(/^clickAl:(.*)$/, async (ctx) => {
            const userId = ctx.match[1]
            this.prismaService.prisma.group.findUniqueOrThrow({
                where: {tg_group_id: chatId}
            }).then(g => {
                g.allow_ids = g.allow_ids.filter(it => it !== BigInt(userId))
                this.prismaService.prisma.group.update({
                    where: {id: g.id},
                    data: {
                        allow_ids: g.allow_ids
                    }
                }).then(() => {
                    // TODO：删除后刷新
                    ctx.answerCbQuery('删除成功')
                })
            }).catch(e => {
                ctx.answerCbQuery('删除失败，群组没绑定')
            })
        })
    }

    public onAction(bot: Telegraf) {

        bot.action(/^download:(.*)$/, async ctx => {

            const sendFileUseWxFileHelper = (ctx) => {
                const wxMsgId = ctx.match[1]
                this.prismaService.getConfigCurrentLoginWxAndToken().then(config => {
                    this.prismaService.prisma.message.findFirst({
                        where: {
                            wx_msg_id: wxMsgId,
                        }
                    }).then(msg => {
                        forward(msg.wx_msg_text, Constants.FILE_HELPER, msg.wx_msg_type_text)
                            .then(res => {
                                // 更新 msg 设置转发的id
                                this.logDebug('forward file message', res)
                                this.prismaService.prisma.message.update({
                                    where: {id: msg.id},
                                    data: {
                                        // @ts-ignore
                                        wx_hp_msg_id: res.newMsgId
                                    }
                                }).then(() => {

                                })
                                ctx.answerCbQuery('正在下载文件，请稍后')
                            }).catch(e => {
                            this.logError('forward file message', e)
                            ctx.answerCbQuery('文件转发失败')
                        })
                    })
                })
            }

            // 检查是否有登录微信文件助手
            if (!this.wxFileClient.hasLogin) {
                ctx.answerCbQuery('请先登录微信文件助手')
                this.wxFileClient.login().then(() => {
                })
            } else {
                sendFileUseWxFileHelper(ctx);
            }
        })

        bot.action(/^fr:(.*)$/, async ctx => {
            const wxId = ctx.match[1]
            const friend = this.wxClient.friendshipList.find(it => it.fromId === wxId)
            if (friend) {
                friend.accept()
                ctx.answerCbQuery('添加成功')
                ctx.editMessageReplyMarkup({
                    inline_keyboard: [[
                        Markup.button.callback('添加成功', 'doNothing')
                    ]]
                })
            } else {
                ctx.answerCbQuery('好友请求已过期')
                ctx.editMessageReplyMarkup({
                    inline_keyboard: [[
                        Markup.button.callback('好友请求已过期', 'doNothing')
                    ]]
                })
            }
        })

        bot.action('doNothing', async (ctx) => {
            return ctx.answerCbQuery()
        })
    }

    async handlerFileMessages(sendParams: {
        chatId: number,
        text: string,
        message_id: number,
        tgMsgId: number,
        type?: string,
        ctx: any,
    }) {
        const {chatId, text, message_id, type, tgMsgId} = sendParams
        // 是自己发送的不处理
        if (TgMessageUtils.popMessage(chatId, message_id)) {
            this.logDebug('自己发送的文件，不处理')
            return
        }
        const group = await this.prismaService.prisma.group.findUniqueOrThrow({
            where: {tg_group_id: chatId}
        })
        if (!group.forward) {
            return
        }
        if (text) {
            this.messageService.addMessages({
                msgType: 'text',
                chatId: chatId,
                tgMsgId: tgMsgId,
                content: text,
            }, ClientEnum.WX_BOT)
        }
        let msgType: MsgType = type as MsgType ?? 'file'
        let downloadParams: DownloadMediaInterface = {}
        this.tgClient.bot.getMessages(chatId, {ids: [message_id]})
            .then(msgs => {
                msgs.forEach(msg => {
                    msg.downloadMedia(downloadParams)
                        .then(file => {
                            const mimeTypeSplit = msg.file.mimeType?.split('/');
                            this.wxClient.sendMessage({
                                msgType: msgType,
                                chatId: chatId,
                                content: '',
                                file: file,
                                fileName: msg.file.name
                                    ?? `${chatId}-${msg.id}-${mimeTypeSplit?.[0]}.${mimeTypeSplit?.[1]}`,
                            }).then().catch(e => {
                                sendParams.ctx?.reply('文件发送失败')
                            })
                        }).catch(e => {
                        sendParams.ctx?.reply('文件下载失败')
                    })
                })
            })
    }

    private syncInfo(ctx, force = false) {
        this.prismaService.prisma.group.findUniqueOrThrow({
            where: {tg_group_id: ctx.chat.id}
        }).then((group) => {
            if (group.is_wx_room) {
                // @ts-ignore
                this.wxClient.bot.Room.find({id: group.wx_id}).then(findWxRoom => {
                    findWxRoom.sync().then(syncedRoom => {
                        this.logDebug('syncedRoom', syncedRoom)
                        this.prismaService.syncRoomDb(syncedRoom.chatroomId)
                        // 更新头像
                        if (force || syncedRoom.avatarImg !== group.headImgUrl) {
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
                        this.logError('syncRoom', e)
                        ctx.reply('同步失败')
                    })
                })

            } else {
                this.wxClient.bot.Contact.find({wxid: group.wx_id}).then(findWxContact => {
                    findWxContact.sync().then(syncedContact => {
                        this.logDebug('syncedContact', syncedContact)
                        // 更新头像
                        if (force || syncedContact._avatarUrl !== group.headImgUrl) {
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
                        this.logError('syncContact', e)
                        ctx.reply('同步失败')
                    })
                    ctx.reply('同步成功')
                })
            }
        }).catch(e => {
            ctx.reply('没绑定当前群组')
            this.prismaService.createOrUpdateWxConcatAndRoom()
        })
    }
}