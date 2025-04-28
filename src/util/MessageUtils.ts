import {
    AppAttachPayload,
    AppMessagePayload,
    AppMsgXmlSchema,
    ChannelsMsgPayload,
    MiniAppMsgPayload, SysMsgPayload, SysMsgXmlSchema, VideoMsgPayload, WCPayInfo
} from "./wx-msg/message-xml";
import {parseString} from 'xml2js'
import {LogUtils} from "./LogUtils";


export async function xmlToJson(xml: string): Promise<any> {
    const firstIndex = xml.indexOf('<')
    if (firstIndex !== 0) {
        xml = xml.substring(firstIndex, xml.length)
    }

    return new Promise((resolve) => {
        parseString(xml, {explicitArray: false}, (err, result) => {
            if (err && Object.keys(err).length !== 0) {
                LogUtils.warn(JSON.stringify(err))
            }
            return resolve(result)
        })
    })
}

export async function parseAppMsgMessagePayload(messageContent: string): Promise<AppMessagePayload> {
    return new Promise((resolve, reject) => {
        xmlToJson(messageContent).then((appMsgXml: AppMsgXmlSchema) => {
            const {title, des, url, thumburl, type, md5, recorditem, mmreader} = appMsgXml.msg?.appmsg ?? {}

            let appattach: AppAttachPayload | undefined
            let channel: ChannelsMsgPayload | undefined
            let miniApp: MiniAppMsgPayload | undefined
            let wcpayinfo: WCPayInfo | undefined
            const tmp = appMsgXml.msg.appmsg?.appattach
            const channeltmp = appMsgXml.msg.appmsg?.finderFeed
            const minitmp = appMsgXml.msg.appmsg?.weappinfo
            if (tmp) {
                appattach = {
                    aeskey: tmp.aeskey,
                    attachid: tmp.attachid,
                    cdnattachurl: tmp.cdnattachurl,
                    cdnthumbaeskey: tmp.cdnthumbaeskey,
                    emoticonmd5: tmp.emoticonmd5,
                    encryver: (tmp.encryver && parseInt(tmp.encryver, 10)) || 0,
                    fileext: tmp.fileext,
                    islargefilemsg: (tmp.islargefilemsg && parseInt(tmp.islargefilemsg, 10)) || 0,
                    totallen: (tmp.totallen && parseInt(tmp.totallen, 10)) || 0,
                }
            }
            if (channeltmp) {
                channel = {
                    authIconType: channeltmp.authIconType,
                    authIconUrl: channeltmp.authIconUrl,
                    avatar: channeltmp.avatar,
                    desc: channeltmp.desc,
                    feedType: channeltmp.feedType,
                    liveId: channeltmp.liveId,
                    mediaCount: channeltmp.mediaCount,
                    nickname: channeltmp.nickname,
                    objectId: channeltmp.objectId,
                    objectNonceId: channeltmp.objectNonceId,
                    username: channeltmp.username,
                }
            }
            if (minitmp) {
                miniApp = {
                    appid: minitmp.appid,
                    pagepath: minitmp.pagepath,
                    shareId: minitmp.shareId,
                    username: minitmp.username,
                    weappiconurl: minitmp.weappiconurl,
                }
            }

            if (appMsgXml.msg?.appmsg?.wcpayinfo) {
                wcpayinfo = appMsgXml.msg.appmsg?.wcpayinfo
            }

            resolve({
                appattach,
                channel,
                des,
                md5,
                miniApp,
                recorditem,
                refermsg: appMsgXml.msg.appmsg?.refermsg,
                thumburl,
                title,
                type: parseInt(type, 10),
                url,
                items: mmreader?.category?.item,
                wcpayinfo,
                videomsg: appMsgXml.msg.videomsg,
                emoji: appMsgXml?.msg?.emoji?.$,
            })
        })
    })

}

export async function parseQuoteMsg(quoteMsg: string): Promise<any> {
    return new Promise((resolve, reject) => {
        parseAppMsgMessagePayload(quoteMsg)
            .then((appMsgPayload: AppMessagePayload) => {
                const referAppMsg = appMsgPayload.refermsg?.content;
                if (referAppMsg.indexOf("<") !== 0) {
                    resolve({
                        title: appMsgPayload.title,
                        referMsg_title: referAppMsg,
                        parentId: appMsgPayload.refermsg?.svrid
                    })
                } else {
                    parseAppMsgMessagePayload(referAppMsg)
                        .then((referMsgPayload: AppMessagePayload) => {
                            resolve({
                                title: appMsgPayload.title,
                                referMsg_title: referMsgPayload.title,
                                parentId: appMsgPayload.refermsg?.svrid
                            })
                        })
                }
            })
    })
}

export async function parseRevokeMsgPayload(messageContent: string): Promise<SysMsgPayload> {
    return new Promise((resolve, reject) => {
        xmlToJson(messageContent).then((sysMsgPayload: SysMsgXmlSchema) => {
            return resolve({
                revokemsg: sysMsgPayload?.sysmsg?.revokemsg,
            });
        })
    })
}