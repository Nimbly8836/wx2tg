import {ClientEnum} from "../constant/ClientConstants";

export type SendMessage = {
    id?: string,
    msgType: MsgType,
    // 群或者自己发送的需要title
    title?: string | '',
    content: string,
    file?: Buffer | string,
    fileName?: string,
    ext?: {
        [key: string]: any,
    },
    chatId?: number,
    fromWxId?: string,
    wxMsgUserName?: string,
    parentId?: number,
    replyId?: number,
    // 返回的消息id
    resMessageId?: string,
    wxMsgType?: number,
    wxMsgTypeText?: string,
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