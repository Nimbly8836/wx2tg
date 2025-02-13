import {ClientEnum} from "../constant/ClientConstants";

export type SendMessage = {
    id?: string,
    msgType: MsgType,
    content: string,
    file?: Buffer,
    fileName?: string,
    ext?: {
        [key: string]: any,
    },
    chatId?: number,
    fromWxId?: string,
}

export type SendingMessage = SendMessage & {
    success: boolean,
    isSending: boolean,
    addTime: number,
    uniqueId: bigint,
    retriesNumber: number,
    client: ClientEnum,
}

export type MsgType = 'text' | 'image' | 'audio' | 'video' | 'file' |
    'location' | 'quote' | 'emoji' | 'redPacket'