import {AbstractClient} from "../base/AbstractClient";
import {ScanStatus, Wechaty, WechatyBuilder} from 'wechaty'
import {SendMessage} from "../base/IMessage";
import {ClientEnum, getClientByEnum} from "../constant/ClientConstants";
import QRCode from "qrcode";
import PrismaService from "../service/PrismaService";
import * as PUPPET from 'wechaty-puppet'
import BotClient from "./BotClient";
import * as fs from "node:fs";
import {Constants} from "../constant/Constants";
import TgClient from "./TgClient";
import {TgMessageUtils} from "../util/TgMessageUtils";
import {autoInjectable, delay, inject, singleton} from "tsyringe";


@autoInjectable()
@singleton()
export class WxFileClient extends AbstractClient<Wechaty> {
    private scanMsgId: number | undefined;

    login(): Promise<boolean> {
        return new Promise<boolean>((resolve, reject) => {
            this.bot.start().then(async () => {
                // 测试是否在线
                // this.bot.say(this.bot.Contact.find())
                try {
                    if (!this.bot.isLoggedIn) {
                        if (fs.existsSync(`${Constants.WX_FILE_CLIENT}.memory-card.json`)) {
                            fs.unlinkSync(`${Constants.WX_FILE_CLIENT}.memory-card.json`)
                        }
                    }
                    this.bot.Contact.find({
                        id: Constants.FILE_HELPER
                    }).then((contact) => {
                        contact.say('ping').then(res => {
                            if (res) {
                                this.hasLogin = true
                                resolve(true)
                            }
                        })
                    })
                } catch (e) {
                    this.hasLogin = false
                    //
                    if (fs.existsSync(`${Constants.WX_FILE_CLIENT}.memory-card.json`)) {
                        fs.unlinkSync(`${Constants.WX_FILE_CLIENT}.memory-card.json`)
                    }
                    reject(e)
                }
            })
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
                this.prismaService.getConfigCurrentLoginWxAndToken().then(config => {
                    QRCode.toBuffer(qrcode).then(buff => {
                        botClient.bot.telegram.sendPhoto(Number(config.bot_chat_id), {
                            source: buff
                        }, {
                            caption: '请使用「微信」扫描二维码登录文件助手'
                        }).then(msg => {
                            this.scanMsgId = msg.message_id
                        })
                    })
                })
            }
        })

        this.bot.on('login', async user => {

            this.prismaService.getConfigCurrentLoginWxAndToken().then(findConfig => {
                const chatId = findConfig.bot_chat_id
                if (this.scanMsgId) {
                    botClient.bot.telegram.deleteMessage(Number(chatId),
                        this.scanMsgId).then(() =>
                        botClient.sendMessage({
                            msgType: 'text',
                            content: '文件助手登录成功',
                            notRecord: true,
                        })
                    )
                } else {
                    botClient.bot.telegram.sendMessage(Number(chatId), '文件助手，登录成功')
                }

            })
            this.hasLogin = true
        })

        this.bot.on('ready', () => {
            this.ready = true
        })

        this.bot.on('message', msg => {
            switch (msg.type()) {
                case PUPPET.types.Message.Video:
                case PUPPET.types.Message.Attachment:
                    // 保存文件， update message 表
                    this.prismaService.prisma.message.findFirst({
                        where: {
                            wx_hp_msg_id: msg.id
                        },
                        include: {
                            group: true
                        }
                    }).then(inDbMsg => {
                        if (inDbMsg) {
                            msg.toFileBox().then(fileBox => {
                                const filePath = Constants.DOWNLOAD_PATH + '/' + inDbMsg.from_wx_id
                                const file = filePath + '/' + fileBox.name
                                if (!fs.existsSync(filePath)) {
                                    fs.mkdirSync(filePath, {recursive: true})
                                }
                                fileBox.toFile(file, true).then(() => {
                                    // 发送文件
                                    this.tgClient.sendMessage({
                                        msgType: 'file',
                                        content: '',
                                        file: filePath,
                                        fileName: fileBox.name,
                                        chatId: Number(inDbMsg.group.tg_group_id)
                                    }).then(res => {
                                        TgMessageUtils.addMessage(Number(inDbMsg.group.tg_group_id), res.id)
                                    })
                                    // 更新数据库
                                    this.prismaService.prisma.message.update({
                                        where: {
                                            id: inDbMsg.id
                                        },
                                        data: {
                                            file_path: filePath,
                                            file_name: fileBox.name,
                                        }
                                    }).then(() => {

                                    })

                                })
                            })
                        }
                    })

                    break;

            }
        })

        this.bot.on('error', error => {
            this.logError('文件助手错误：', error)
        })

        this.bot.on('logout', () => {
            this.hasLogin = false
            this.ready = false
        })

        this.bot.on('stop', () => {
            this.hasLogin = false
            this.ready = false
        })
    }

    constructor(readonly prismaService: PrismaService,
                @inject(delay(() => TgClient)) readonly tgClient: TgClient) {
        super();
        // 无法从文件缓存中恢复
        this.bot = WechatyBuilder.build({
            name: Constants.WX_FILE_CLIENT,
            puppet: 'wechaty-puppet-wechat4u',
            puppetOptions: {
                timeoutSeconds: 60 * 3,
            },
        });
    }


    private initialize(): void {
        this.spyClients.set(ClientEnum.TG_BOT, getClientByEnum(ClientEnum.TG_BOT));
        this.onMessage(null);
    }


}