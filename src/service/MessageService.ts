import {AbstractService, Singleton} from "../base/IService";
import {SendingMessage, SendMessage} from "../base/IMessage";
import {Snowflake} from "nodejs-snowflake";
import {ClientEnum} from "../constant/ClientConstants";
import IClient from "../base/IClient";
import {SimpleClientFactory} from "../base/Factory";
import {LogUtils} from "../util/LogUtils";
import PrismaService from "./PrismaService";

export class MessageService extends Singleton<MessageService> {
    public static readonly snowflake = new Snowflake();

    private messageQueue: SendingMessage[] = [];

    private clients: Map<ClientEnum, IClient> = new Map<ClientEnum, IClient>();

    private loopTime = 503

    private maxRetries = 3;

    private prismaService = PrismaService.getInstance(PrismaService)

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

    private async processQueue(): Promise<void> {
        if (this.messageQueue.length > 0) {
            const sendMessage = this.messageQueue.shift()

            let retryCount = sendMessage?.retriesNumber || 0;

            if (!sendMessage?.success && !sendMessage?.isSending && retryCount < this.maxRetries) {
                sendMessage.isSending = true;
                const client = this.clients.get(sendMessage.client);
                const send = client.sendMessage(sendMessage)
                    .then(async resMsg => {
                        sendMessage.success = true;
                        sendMessage.isSending = false;
                        this.prismaService.prisma.message.create({
                            data: {
                                from_wx_id: sendMessage.fromWxId,
                                content: sendMessage.content,
                                tg_msg_id: resMsg?.message_id,
                                wx_msg_id: sendMessage.ext?.wxMsgId,
                                parent_id: sendMessage.parentId,
                                group: {
                                    connect: {
                                        tg_group_id: sendMessage.chatId,
                                    }
                                }
                            }
                        }).then(() => {
                            LogUtils.debug('Message saved');
                        }).catch(e => {
                            LogUtils.error('Failed to save message', e, sendMessage);
                        });
                    }).catch(async e => {
                        LogUtils.error('Failed to send message', e);
                        // 增加重试次数
                        retryCount += 1;
                        sendMessage.retriesNumber = retryCount;

                        // 如果错误是因为群组升级为超级群组
                        if (e.response?.error_code === 400
                            && e.response?.description === 'Bad Request: group chat was upgraded to a supergroup chat') {
                            const migrateToChatId = e?.response?.parameters?.migrate_to_chat_id;
                            if (migrateToChatId) {
                                this.prismaService.prisma.group.update({
                                    where: {tg_group_id: sendMessage.chatId},
                                    data: {tg_group_id: Number(migrateToChatId)}
                                }).then(() => send);
                            }
                        }
                    }).finally(() => {
                        // 如果达到最大重试次数，停止重试
                        if (retryCount >= this.maxRetries) {
                            LogUtils.error(`Max retries reached for message: ${sendMessage.content}`);
                            sendMessage.isSending = false;
                            sendMessage.success = false; // 标记为失败
                        }
                    });

                // 保证重试次数达到最大值时停止重试
                send.catch(() => send)
                    .finally(() => {
                        if (retryCount >= this.maxRetries) {
                            sendMessage.isSending = false;
                        }
                    });
            }
        }
    }


    private startSend(): void {
        setInterval(async () => {
            await this.processQueue()
        }, this.loopTime)
    }

}