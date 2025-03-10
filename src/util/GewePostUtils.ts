import {Contact} from "gewechaty";
import {ForwardFile, ForwardImage, ForwardMiniApp, ForwardUrl, ForwardVideo, revokeMsg, SendText} from "./GeweApi";
import {getAppId} from "./DS";
import {MessageType} from "../entity/Message";
import {LogUtils} from "./LogUtils";

export const forward = async (content, contact: string | Contact, type: string) => {
    let toWxId = ''
    if (typeof contact === 'string') {
        toWxId = contact
    } else if (contact instanceof Contact) {
        toWxId = contact._wxid
    } else {
        throw new Error('转发对象必须传入wxid或者contact对象')
    }
    switch (type) {
        case MessageType.Text:
            return SendText({
                appId: getAppId(),
                content,
                toWxid: toWxId,
                ats: ''
            })
        case MessageType.Image:
            return ForwardImage({
                appId: getAppId(),
                toWxid: toWxId,
                xml: content
            })
        case MessageType.File:
            return ForwardFile({
                appId: getAppId(),
                toWxid: toWxId,
                xml: content
            })
        case MessageType.Video:
            return ForwardVideo({
                appId: getAppId(),
                toWxid: toWxId,
                xml: content
            })
        case MessageType.Link:
            return ForwardUrl({
                appId: getAppId(),
                toWxid: toWxId,
                xml: content
            })
        case MessageType.MiniApp:
            return ForwardMiniApp({
                appId: getAppId(),
                toWxid: toWxId,
                xml: content
            })
        default:
            LogUtils.error('无法转发的消息类型', type)
    }

}

export const revoke = async (content: {
    toWxid: string,
    msgId: string,
    newMsgId: string,
    createTime: number
}) => {
    return revokeMsg({
        appId: getAppId(),
        toWxid: content.toWxid,
        msgId: content.msgId,
        newMsgId: content.newMsgId,
        createTime: content.createTime,
    })
}