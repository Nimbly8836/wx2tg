import {Telegraf} from "telegraf";
import {AbstractService, Singleton} from "../base/IService";
import {SendMessage} from "../base/IMessage";
import {MessageService} from "./MessageService";
import {ClientEnum} from "../constant/ClientConstants";
import {SimpleClientFactory} from "../base/Factory";
import PrismaService from "./PrismaService";
import {ConfigEnv} from "../config/Config";

export default class BotHelper extends Singleton<BotHelper> {

    constructor() {
        super();
    }

    public setCommands(bot: Telegraf): void {
        const commands = [
            {command: 'help', description: '帮助'},
            {command: 'start', description: '开始'},
            {command: 'login', description: '登录'},
            {command: 'user', description: '查看联系人，支持昵称和备注查询'},
            {command: 'room', description: '查看群组，支持昵称和备注查询'},
        ]

        bot.telegram.setMyCommands(commands)
    }

    public onCommand(bot: Telegraf) {
        bot.command('help', (ctx) => {
            ctx.reply('help')
            // bot.telegram.getMe().then(me => {
            //
            // })
        })

        bot.command('start', (ctx) => {
            const config = PrismaService.getInstance(PrismaService).config()
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
                            ctx.reply('应用启动成功，请按照提示登录 TG 和 微信')
                        }).catch(e => {
                            ctx.reply('应用启动失败')
                        })
                    }
                })
        })

        bot.command('login', (ctx) => {
            let WxClient = SimpleClientFactory.getSingletonClient(ClientEnum.WX_BOT);
            WxClient.login().then(r => {
                ctx.reply(r ? '登陆成功' : '登陆失败')
            })
        })
    }

    private user(bot: Telegraf) {
        return bot.command('user', (ctx) => {

        })
    }

    public sendMessage(message: SendMessage) {
        MessageService.getInstance(MessageService).addMessages(message, ClientEnum.TG_BOT)
    }

}