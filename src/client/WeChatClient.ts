import {AbstractClient} from "../base/AbstractClient";
import {GeweBot} from "gewechaty";
import {ConfigEnv} from "../config/Config";
import {SimpleClientFactory} from "../base/Factory";
import {ClientEnum} from "../constant/ClientConstants";
import QRCode from 'qrcode'
import PrismaService from "../service/PrismaService";


export class WeChatClient extends AbstractClient {
    bot: GeweBot;

    private constructor() {
        super();
        this.bot = new GeweBot({
            base_api: ConfigEnv.BASE_API,
            file_api: ConfigEnv.FILE_API,
            debug: false,
        })
    }

    static getInstance(): WeChatClient {
        if (this.instance == null) {
            this.instance = new WeChatClient();
            (this.instance as WeChatClient).initialize();
        }
        return this.instance as WeChatClient;
    }

    private initialize(): void {
        this.spyClients.set(ClientEnum.TG_BOT,
            SimpleClientFactory.getSingletonClient(ClientEnum.TG_BOT));
    }


    login(): Promise<boolean> {
        return new Promise<boolean>((resolve, reject) => {

            this.bot.start().then(async ({app, router}) => {
                app.use(router.routes()).use(router.allowedMethods())

                // 更新 config 表 wxid
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
                    const tgBot = this.spyClients.get(ClientEnum.TG_BOT);
                    if (!error) {
                        PrismaService.getInstance(PrismaService).config().findFirst({where: {bot_token: ConfigEnv.BOT_TOKEN}}).then(findConfig => {
                            const chatId = findConfig.bot_chat_id
                            tgBot.bot.telegram.sendPhoto(Number(chatId), {source: buffer}, {caption: '请使用 微信 扫码登录'})
                        })
                    }
                })
            }
        })
    }

}