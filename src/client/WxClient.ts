import {AbstractClient} from "../base/AbstractClient";
import {GeweBot} from "gewechaty";
import {ConfigEnv} from "../config/Config";
import {ClientEnum, getClientByEnum} from "../constant/ClientConstants";
import QRCode from 'qrcode'
import PrismaService from "../service/PrismaService";
import BotClient from "./BotClient";
import WxMessageHelper from "../service/WxMessageHelper";
import {LogUtils} from "../util/LogUtils";


export class WxClient extends AbstractClient<GeweBot> {

    private scanPhotoMsgId: number
    private messageSet: Set<string> = new Set();
    private wxMessageHelper = WxMessageHelper.getInstance(WxMessageHelper);


    private constructor() {
        super();
        this.bot = new GeweBot({
            base_api: ConfigEnv.BASE_API,
            file_api: ConfigEnv.FILE_API,
            debug: false,
            cache_path: 'storage/gewe',
        })
    }

    private loginTime: number = 0

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
                this.bot.info().then(async info => {
                    const botClient = this.spyClients.get(ClientEnum.TG_BOT) as BotClient
                    const botId = Number(botClient.bot.botInfo.id)
                    config.updateMany({
                        where: {bot_token: ConfigEnv.BOT_TOKEN},
                        data: {login_wxid: info.wxid, bot_id: botId}
                    }).then(() => {
                        prismaService.createOrUpdateWxConcatAndRoom(info.wxid)
                    })
                    if (this.scanPhotoMsgId) {
                        prismaService.getConfigByToken().then(findConfig => {
                            const chatId = findConfig.bot_chat_id
                            botClient.bot.telegram.editMessageCaption(Number(chatId),
                                this.scanPhotoMsgId, null, '微信，登录成功')
                        })
                    }
                }).catch(e => {
                    LogUtils.error('WxClient get info error : %s', e)
                })
                this.onMessage(null)
                this.loginTime = new Date().getTime() / 1000
                resolve(true)

            }).catch(e => {
                reject(e)
            })

            this.onMessage(null)
        })
    }

    logout(): Promise<boolean> {
        return this.bot.logout()
    }

    sendMessage(any: any): Promise<Record<string, any>> {
        return null
    }

    check(): Promise<boolean> {
        return this.bot.checkOnline()
    }

    private isDuplicateMessage(msgId: string): boolean {
        if (this.messageSet.has(msgId)) {
            return true;
        }
        this.messageSet.add(msgId);
        setTimeout(() => this.messageSet.delete(msgId), 30000);
        return false;
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
                                tgBot.bot.telegram.sendPhoto(Number(chatId), {source: buffer},
                                    {caption: '请使用「微信」扫码登录'})
                                    .then((res) => {
                                        this.scanPhotoMsgId = res.message_id
                                    })
                            })
                    }
                })
            }
        })
        this.bot.on('message', async (msg) => {

                if (this.isDuplicateMessage(msg._newMsgId)) {
                    return
                }
                // 只处理登录之后的消息
                LogUtils.debug('message: %s', msg.text())
                if (msg._createTime >= this.loginTime) {
                    this.wxMessageHelper.sendMessages(msg).then()
                }
            }
        )
        this.bot.on('room-invite', async (msg) => {

        })
    }

}