import {AbstractClient} from "../base/AbstractClient";
import {ScanStatus, Wechaty, WechatyBuilder} from 'wechaty'
import {SendMessage} from "../base/IMessage";
import {ClientEnum, getClientByEnum} from "../constant/ClientConstants";
import QRCode from "qrcode";
import PrismaService from "../service/PrismaService";
import * as PUPPET from 'wechaty-puppet'
import BotClient from "./BotClient";


export class WxFileClient extends AbstractClient<Wechaty> {
    private scanMsgId: number | undefined;
    private prismaService = PrismaService.getInstance(PrismaService)

    login(): Promise<boolean> {
        return new Promise<boolean>((resolve, reject) => {
        })
    }

    logout(): Promise<boolean> {
        throw new Error("Method not implemented.");
    }

    sendMessage(msgParams: SendMessage): Promise<Record<string, any>> {
        throw new Error("Method not implemented.");
    }

    onMessage(any: any): void {
        const botClient = this.spyClients.get(ClientEnum.TG_BOT) as BotClient;
        this.bot.on('scan', (qrcode, status) => {
            if (status === ScanStatus.Waiting || status === ScanStatus.Timeout) {
                this.hasLogin = false
                this.prismaService.getConfigByToken().then(config => {
                    QRCode.toBuffer(qrcode).then(buff => {
                        botClient.bot.telegram.sendPhoto(Number(config.bot_chat_id), {
                            source: buff
                        }, {
                            caption: '请用微信扫描二维码登录文件助手'
                        }).then(msg => {
                            this.scanMsgId = msg.message_id
                        })
                    })
                })
            }
        })

        this.bot.on('login', async user => {
            if (this.scanMsgId) {
                this.prismaService.getConfigByToken().then(findConfig => {
                    const chatId = findConfig.bot_chat_id
                    botClient.bot.telegram.editMessageCaption(Number(chatId),
                        this.scanMsgId, null, '文件助手，登录成功')
                })
            }
            this.hasLogin = true
        })

        this.bot.on('ready', () => {
            this.ready = true
        })

        this.bot.on('message', msg => {
            switch (msg.type()) {
                case PUPPET.types.Message.Video:
                case PUPPET.types.Message.Attachment:

            }
        })

        this.bot.on('error', error => {
            this.logError('文件助手错误：', error)
        })

        this.bot.on('logout', () => {
            this.hasLogin = false
            this.ready = false
        })
    }

    private constructor() {
        super();
        this.bot = WechatyBuilder.build({
            name: 'storage/fileHelper',
            puppet: 'wechaty-puppet-wechat4u',
        });
    }

    static getInstance(): WxFileClient {
        if (this.instance == null) {
            this.instance = new WxFileClient();
            (this.instance as WxFileClient).initialize();
        }
        return this.instance as WxFileClient;
    }

    private initialize(): void {
        this.spyClients.set(ClientEnum.TG_BOT, getClientByEnum(ClientEnum.TG_BOT));
    }


}