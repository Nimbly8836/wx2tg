import {ClientEnum} from "../constant/ClientConstants";

export type SendMessage = {
    id?: string,
    msgType: 'text' | 'image' | 'audio' | 'video' | 'file' | 'location' | 'quote',
    content?: string,
    file?: Buffer,
    fileName?: string,
    ext?: {
        [key: string]: any,
    },
    chatId?: number,
}

export type SendingMessage = SendMessage & {
    success: boolean,
    isSending: boolean,
    addTime: number,
    uniqueId: bigint,
    retriesNumber: number,
    client: ClientEnum,
}