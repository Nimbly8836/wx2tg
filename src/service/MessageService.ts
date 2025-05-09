import {SendingMessage, SendMessage} from "../base/IMessage";
import {Snowflake} from "nodejs-snowflake";
import {ClientEnum, getClientByEnum} from "../constant/ClientConstants";
import IClient from "../base/IClient";
import PrismaService from "./PrismaService";
import TgClient from "../client/TgClient";
import {WxClient} from "../client/WxClient";
import BotClient from "../client/BotClient";
import {autoInjectable, delay, inject, singleton} from "tsyringe";
import {AbstractService} from "../base/IService";


@singleton()
export class MessageService extends AbstractService {
    public static readonly snowflake = new Snowflake();

    private readonly messageQueue: SendingMessage[] = [];

    private readonly clients: Map<ClientEnum, IClient> = new Map<ClientEnum, IClient>();

    private readonly loopTime = 829

    private readonly maxRetries = 3;

    constructor(
        readonly prismaService: PrismaService,
        @inject(delay(() => BotClient))private readonly botClient: BotClient,
        @inject(delay(() => WxClient)) private readonly wxClient: WxClient,
        @inject(delay(() => TgClient))private readonly tgClient: TgClient
    ) {
        super();
        // 初始化 clients Map
        this.clients.set(ClientEnum.TG_BOT, this.botClient);
        this.clients.set(ClientEnum.WX_BOT, this.wxClient);
        this.clients.set(ClientEnum.TG_USER, this.tgClient);
        this.startSend();
    }

    public addMessages(sendMessage: SendMessage, usingClient: ClientEnum) {
        const uniqueId = MessageService.snowflake.getUniqueID();
        const sendingMessage: SendingMessage = {
            isSending: false,
            success: false,
            addTime: new Date().getTime(),
            uniqueId: uniqueId.valueOf(),
            retriesNumber: 0,
            client: usingClient,
            ...sendMessage
        }
        let left = 0
        let right = this.messageQueue.length - 1
        while (left <= right) {
            const mid = left + Math.floor((right - left) / 2)
            if (this.messageQueue[mid].uniqueId < uniqueId.valueOf()) {
                left = mid + 1
            } else {
                right = mid - 1
            }
        }
        this.messageQueue.splice(left, 0, sendingMessage)
        // 不再需要动态获取客户端，因为已经在构造函数中初始化
    }

    private processQueue() {
        if (this.messageQueue.length > 0) {
            const sendMessage = this.messageQueue.shift();
            let retryCount = sendMessage?.retriesNumber || 0;

            if (!sendMessage?.success && !sendMessage?.isSending && retryCount < this.maxRetries) {
                sendMessage.isSending = true;
                const client = this.clients.get(sendMessage.client);

                const doSend = (result) => client.sendMessage(sendMessage)
                    .then(resMsg => {
                        sendMessage.success = true;
                        sendMessage.isSending = false;


                        if (!sendMessage?.notRecord) {
                            this.prismaService.prisma.message.upsert({
                                where: {
                                    id: result?.id
                                },
                                create: {
                                    from_wx_id: sendMessage.fromWxId,
                                    content: sendMessage.content,
                                    tg_msg_id: sendMessage.tgMsgId ?? resMsg?.message_id,
                                    wx_msg_id: sendMessage.ext?.wxMsgId?.toString(),
                                    parent_id: sendMessage.parentId,
                                    wx_msg_user_name: sendMessage.wxMsgUserName,
                                    wx_msg_text: sendMessage.ext?.wxMsgText,
                                    wx_msg_type: sendMessage.wxMsgType,
                                    wx_msg_type_text: sendMessage.wxMsgTypeText,
                                    msg_id: sendMessage.ext?.msgId?.toString(),
                                    wx_msg_create: Number(sendMessage.ext?.wxMsgCreate),
                                    group: {
                                        connect: {
                                            tg_group_id: sendMessage.chatId,
                                        }
                                    }
                                },
                                update: {
                                    from_wx_id: sendMessage.fromWxId,
                                    content: sendMessage.content,
                                    tg_msg_id: sendMessage.tgMsgId ?? resMsg?.message_id,
                                    wx_msg_id: sendMessage.ext?.wxMsgId ?? resMsg?.newMsgId?.toString(),
                                    parent_id: sendMessage.parentId,
                                    wx_msg_user_name: sendMessage.wxMsgUserName ?? '你',
                                    wx_msg_text: sendMessage.ext?.wxMsgText,
                                    wx_msg_type: sendMessage.wxMsgType ?? resMsg?.type,
                                    wx_msg_type_text: sendMessage.wxMsgTypeText ?? sendMessage.msgType,
                                    wx_msg_create: Number(sendMessage.ext?.wxMsgCreate ?? resMsg?.createTime),
                                    msg_id: sendMessage.ext?.msgId?.toString() ?? resMsg?.msgId?.toString(),
                                },
                            }).then(() => {
                                this.logDebug('Message saved');
                            }).catch(e => {
                                this.logError('Failed to save message', e, sendMessage);
                            });
                        }
                    })
                    .catch(e => {
                        this.logError('Failed to send message', e);

                        // Increment retry count and re-add to the queue for retry
                        retryCount += 1;
                        sendMessage.retriesNumber = retryCount;
                        this.messageQueue.unshift(sendMessage);

                        // Handle group upgrade to supergroup
                        if (e.response?.error_code === 400 &&
                            e.response?.description === 'Bad Request: group chat was upgraded to a supergroup chat') {
                            const migrateToChatId = e?.response?.parameters?.migrate_to_chat_id;
                            if (migrateToChatId) {
                                // Update the group in the database asynchronously
                                this.prismaService.prisma.group.update({
                                    where: {tg_group_id: sendMessage.chatId},
                                    data: {tg_group_id: Number(migrateToChatId)}
                                }).then(() => {
                                    // After migration, we process the queue again
                                    this.processQueue();
                                }).catch(groupUpdateError => {
                                    this.logError('Failed to update group', groupUpdateError);
                                });
                            }
                        }

                        // 消息过多的时候
                        if (e.response?.error_code === 429 && e.response?.description.includes('Too Many Requests')) {
                            const time = e.response?.parameters?.retry_after * 1000 || 20000
                            setTimeout(() => {
                                this.messageQueue.unshift(sendMessage)
                            }, time)
                        }
                    })
                    .finally(() => {
                        // Stop retrying if max retries reached
                        if (retryCount >= this.maxRetries) {
                            this.logError(`Max retries reached for message: ${sendMessage.content}`)
                            sendMessage.isSending = false
                            sendMessage.success = false // Mark as failed
                            // 发送提示
                            const botClient = this.clients.get(ClientEnum.TG_BOT) as BotClient;
                            // 发送失败提示
                            botClient.sendMessage({
                                msgType: 'text',
                                chatId: sendMessage.chatId,
                                content: '消息发送失败',
                                ext: {
                                    reply_parameters: {
                                        message_id: sendMessage.tgMsgId
                                    }
                                }
                            }).then().catch((err) => {
                                botClient.sendMessage({
                                    msgType: 'text',
                                    chatId: sendMessage.chatId,
                                    content: `<blockquote>${sendMessage.content}</blockquote>消息发送失败`,
                                    ext: {
                                        parse_mode: 'HTML'
                                    }
                                }).then()
                            })
                        }
                    });
                this.prismaService.prisma.message.create({
                    data: {
                        from_wx_id: sendMessage.fromWxId,
                        content: sendMessage.content,
                        tg_msg_id: sendMessage.tgMsgId,
                        wx_msg_id: sendMessage.ext?.wxMsgId,
                        parent_id: sendMessage.parentId,
                        wx_msg_user_name: sendMessage.wxMsgUserName,
                        wx_msg_text: sendMessage.ext?.wxMsgText,
                        wx_msg_type: sendMessage.wxMsgType,
                        wx_msg_type_text: sendMessage.wxMsgTypeText,
                        group: {
                            connect: {
                                tg_group_id: sendMessage.chatId,
                            }
                        }
                    }
                }).then(result => {
                    doSend(result).then()
                }).catch(e => {
                    this.logError('Failed to save message', e);
                    doSend({}).then()
                })

            }
        }
    }


    private startSend(): void {
        const minInterval = 569; // Minimum delay
        const maxInterval = this.loopTime; // Maximum delay

        setInterval(async () => {
            this.processQueue();
        }, Math.floor(Math.random() * (maxInterval - minInterval + 1)) + minInterval); // Random delay between min and max
    }


}