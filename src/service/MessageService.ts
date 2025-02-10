import {AbstractService, Singleton} from "../base/IService";
import {SendingMessage, SendMessage} from "../base/IMessage";
import {Snowflake} from "nodejs-snowflake";
import {ClientEnum} from "../constant/ClientConstants";
import IClient from "../base/IClient";
import {SimpleClientFactory} from "../base/Factory";
import {LogUtils} from "../util/LogUtils";

export class MessageService extends Singleton<MessageService> {
    public static readonly snowflake = new Snowflake();

    private messageQueue: SendingMessage[] = [];

    private clients: Map<ClientEnum, IClient> = new Map<ClientEnum, IClient>();

    private loopTime = 503

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
            if (!sendMessage?.success && !sendMessage?.isSending) {
                sendMessage.isSending = true
                const client = this.clients.get(sendMessage.client)
                const send = client.sendMessage(sendMessage).then(() => {
                    sendMessage.success = true
                    sendMessage.isSending = false
                    // TODO: save message to db
                }).catch(async e => {
                    LogUtils.error('Failed to send message', e)
                })
                send.catch(() => send)
                    .finally(() => {
                        sendMessage.isSending = false
                    })
            }
        }

    }

    private startSend(): void {
        setInterval(async () => {
            await this.processQueue()
        }, this.loopTime)
    }

}