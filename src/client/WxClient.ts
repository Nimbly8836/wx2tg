import {AbstractClient} from "../base/AbstractClient";
import {GeweBot} from "gewechaty";
import {ConfigEnv} from "../config/Config";
import {ClientEnum, getClientByEnum} from "../constant/ClientConstants";
import QRCode from 'qrcode'
import PrismaService from "../service/PrismaService";
import BotClient from "./BotClient";
import WxMessageHelper from "../service/WxMessageHelper";
import {MessageService} from "../service/MessageService";


export class WxClient extends AbstractClient<GeweBot> {

    private constructor() {
        super();
        this.bot = new GeweBot({
            base_api: ConfigEnv.BASE_API,
            file_api: ConfigEnv.FILE_API,
            debug: false,
        })
    }

    static getInstance(): WxClient {
        if (this.instance == null) {
            this.instance = new WxClient();
            (this.instance as WxClient).initialize();
        }
        return this.instance as WxClient;
    }

    private initialize(): void {
        this.spyClients.set(ClientEnum.TG_BOT, getClientByEnum(ClientEnum.TG_BOT));
    }


    login(): Promise<boolean> {
        return new Promise<boolean>((resolve, reject) => {

            this.bot.start().then(async ({app, router}) => {
                app.use(router.routes()).use(router.allowedMethods())

                // 更新 config 表 wx_id 插入缓存的 concat 和 room
                let prismaService = PrismaService.getInstance(PrismaService);
                const config = prismaService.config()
                this.bot.info().then(info => {
                    config.updateMany({
                        where: {bot_token: ConfigEnv.BOT_TOKEN},
                        data: {login_wxid: info.wxid}
                    }).then(() => {
                        prismaService.createOrUpdateWxConcatAndRoom(info.wxid)
                    })
                })
                resolve(true)
            }).catch(e => {
                reject(e)
            })

            this.onMessage(null)

        })
    }

    logout(): Promise<boolean> {
        return null
    }

    sendMessage(any: any): Promise<object> {
        return null
    }

    onMessage(any: any): void {
        this.bot.on('scan', qrcode => {
            if (qrcode) {
                QRCode.toBuffer(qrcode.content, {
                    width: 150
                }, (error, buffer) => {
                    const tgBot = this.spyClients.get(ClientEnum.TG_BOT) as BotClient;
                    if (!error) {
                        PrismaService.getInstance(PrismaService).config()
                            .findFirst({where: {bot_token: ConfigEnv.BOT_TOKEN}})
                            .then(findConfig => {
                                const chatId = findConfig.bot_chat_id
                                tgBot.bot.telegram.sendPhoto(Number(chatId), {source: buffer}, {caption: '请使用 微信 扫码登录'}).then(() => {

                                })
                            })
                    }
                })
            }
        })
        this.bot.on('message', async (msg) => {
            const messageService = MessageService.getInstance(MessageService);
            const wxMessageHelper = WxMessageHelper.getInstance(WxMessageHelper);
            wxMessageHelper.createGroup(msg).then((res) => {
                if (res) {

                }
            })
        })

        // this.bot.on('')
    }

}