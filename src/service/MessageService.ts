import {Singleton} from "../base/IService";
import {SendingMessage, SendMessage} from "../base/IMessage";
import {Snowflake} from "nodejs-snowflake";
import {ClientEnum} from "../constant/ClientConstants";
import IClient from "../base/IClient";
import {SimpleClientFactory} from "../base/Factory";
import PrismaService from "./PrismaService";
import TgClient from "../client/TgClient";
import {WxClient} from "../client/WxClient";

export class MessageService extends Singleton<MessageService> {
    public static readonly snowflake = new Snowflake();

    private readonly messageQueue: SendingMessage[] = [];

    private readonly clients: Map<ClientEnum, IClient> = new Map<ClientEnum, IClient>();

    private readonly loopTime = 829

    private readonly maxRetries = 3;

    private readonly prismaService = PrismaService.getInstance(PrismaService)

    constructor() {
        super();
        this.startSend()
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
        if (!this.clients.get(usingClient)) {
            this.clients.set(usingClient, SimpleClientFactory.getSingletonClient(usingClient))
        }
    }

    private processQueue() {
        const wxClient = this.clients.get(ClientEnum.WX_BOT) as WxClient;
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
                                    from_wx_id: sendMessage.fromWxId ?? wxClient?.me?.wxid,
                                    content: sendMessage.content,
                                    tg_msg_id: sendMessage.tgMsgId ?? resMsg?.message_id,
                                    wx_msg_id: sendMessage.ext?.wxMsgId ?? resMsg?.newMsgId?.toString(),
                                    parent_id: sendMessage.parentId,
                                    wx_msg_user_name: sendMessage.wxMsgUserName ?? '你',
                                    wx_msg_text: sendMessage.ext?.wxMsgText,
                                    wx_msg_type: sendMessage.wxMsgType ?? resMsg?.type,
                                    wx_msg_type_text: sendMessage.wxMsgTypeText ?? sendMessage.msgType,
                                    wx_msg_create: Number(sendMessage.ext?.wxMsgCreate) ?? Number(resMsg?.createTime),
                                    msg_id: sendMessage.ext?.msgId?.toString() ?? resMsg?.msgId.toString(),
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
                            const tgClient = this.clients.get(ClientEnum.TG_BOT) as TgClient;
                            // 发送失败提示
                            tgClient.sendMessage({
                                msgType: 'text',
                                chatId: sendMessage.chatId,
                                content: '消息发送失败',
                                // ext: {
                                //     reply_parameters: {
                                //         message_id:
                                //     }
                                // }
                            }).then()
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