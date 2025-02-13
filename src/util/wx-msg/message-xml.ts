export interface AppMsgXmlSchema {
    msg: {
        appmsg: {
            title: string;
            des: string;
            type: string;
            url: string;
            appattach: {
                totallen: string;
                attachid: string;
                emoticonmd5: string;
                fileext: string;
                cdnattachurl: string;
                cdnthumbaeskey: string;
                aeskey: string;
                encryver: string;
                islargefilemsg: string;
            };
            thumburl: string;
            md5: any;
            recorditem?: string;
            weappinfo?: {
                username: string;
                appid: string;
                pagepath: string;
                weappiconurl: string;
                shareId: string;
            };
            refermsg?: {
                type: string;
                svrid: string;
                fromusr: string;
                chatusr: string;
                displayname: string;
                content: string;
            };
            finderFeed?: {
                objectId: string;
                feedType: string;
                nickname: string;
                avatar: string;
                desc: string;
                mediaCount: string;
                objectNonceId: string;
                liveId: string;
                username: string;
                authIconUrl: string;
                authIconType: string;
                mediaList?: {
                    media?: {
                        thumbUrl: string,
                        fullCoverUrl: string,
                        videoPlayDuration: string,
                        url: string,
                        height: string,
                        mediaType: string,
                        width: string
                    }
                },
                megaVideo?: object,
                bizAuthIconType: string
            };
            mmreader?: {
                category?: {
                    item?: appMsgXmlSchema_mmreader_item []
                }
            }
            wcpayinfo?: { // 红包，
                templateid?: string; // 模板ID
                url?: string; // 红包链接
                iconurl?: string; // 图标URL
                receivertitle?: string; // 接收者标题
                sendertitle?: string; // 发送者标题
                scenetext?: string; // 场景文本
                senderdes?: string; // 发送者描述
                receiverdes?: string; // 接收者描述
                nativeurl?: string; // 原生URL
                sceneid?: string; // 场景ID
                innertype?: string; // 内部类型
                paymsgid?: string; // 支付消息ID
                locallogoicon?: string; // 本地图标
                invalidtime?: string; // 失效时间
                senderc2cshowsourceurl?: string; // 发送者C2C展示源URL
                senderc2cshowsourcemd5?: string; // 发送者C2C展示源MD5
                receiverc2cshowsourceurl?: string; // 接收者C2C展示源URL
                receiverc2cshowsourcemd5?: string; // 接收者C2C展示源MD5
                recshowsourceurl?: string; // 接收展示源URL
                recshowsourcemd5?: string; // 接收展示源MD5
                detailshowsourceurl?: string; // 详情展示源URL
                detailshowsourcemd5?: string; // 详情展示源MD5
                corpname?: string; // 公司名称
                coverinfo?: string; // 封面信息
                broaden?: string; // 扩展字段
            }
        };
        fromusername: string;
        appinfo: {
            appname: any;
        };
    };
}

export interface WCPayInfo {
    templateid?: string; // 模板ID
    url?: string; // 红包链接
    iconurl?: string; // 图标URL
    receivertitle?: string; // 接收者标题
    sendertitle?: string; // 发送者标题
    scenetext?: string; // 场景文本
    senderdes?: string; // 发送者描述
    receiverdes?: string; // 接收者描述
    nativeurl?: string; // 原生URL
    sceneid?: string; // 场景ID
    innertype?: string; // 内部类型
    paymsgid?: string; // 支付消息ID
    locallogoicon?: string; // 本地图标
    invalidtime?: string; // 失效时间
    senderc2cshowsourceurl?: string; // 发送者C2C展示源URL
    senderc2cshowsourcemd5?: string; // 发送者C2C展示源MD5
    receiverc2cshowsourceurl?: string; // 接收者C2C展示源URL
    receiverc2cshowsourcemd5?: string; // 接收者C2C展示源MD5
    recshowsourceurl?: string; // 接收展示源URL
    recshowsourcemd5?: string; // 接收展示源MD5
    detailshowsourceurl?: string; // 详情展示源URL
    detailshowsourcemd5?: string; // 详情展示源MD5
    corpname?: string; // 公司名称
    coverinfo?: string; // 封面信息
    broaden?: string; // 扩展字段
}

export interface AppAttachPayload {
    totallen?: number;
    attachid?: string;
    emoticonmd5?: string;
    fileext?: string;
    cdnattachurl?: string;
    aeskey?: string;
    cdnthumbaeskey?: string;
    encryver?: number;
    islargefilemsg: number;
}

export interface ReferMsgPayload {
    type: string;
    svrid: string;
    fromusr: string;
    chatusr: string;
    displayname: string;
    content: string;
}

export interface ChannelsMsgPayload {
    objectId: string;
    feedType: string;
    nickname: string;
    avatar: string;
    desc: string;
    mediaCount: string;
    objectNonceId: string;
    liveId: string;
    username: string;
    authIconUrl: string;
    authIconType: string;
    mediaList?: {
        media?: {
            thumbUrl: string,
            fullCoverUrl: string,
            videoPlayDuration: string,
            url: string,
            height: string,
            mediaType: string,
            width: string
        }
    },
    megaVideo?: object,
    bizAuthIconType?: string
}

export interface MiniAppMsgPayload {
    username: string;
    appid: string;
    pagepath: string;
    weappiconurl: string;
    shareId: string;
}

export interface AppMessagePayload {
    des?: string;
    thumburl?: string;
    title: string;
    url: string;
    appattach?: AppAttachPayload;
    channel?: ChannelsMsgPayload;
    miniApp?: MiniAppMsgPayload;
    type: AppMessageType;
    md5?: string;
    fromusername?: string;
    recorditem?: string;
    refermsg?: ReferMsgPayload;
    items?: appMsgXmlSchema_mmreader_item [];
    wcpayinfo?: WCPayInfo;
}

export interface appMsgXmlSchema_mmreader_item {
    title: string;
    cover: string;
    url: string;
    summary?: string;
}

export enum AppMessageType {
    Text = 1,
    Img = 2,
    Audio = 3,
    Video = 4,
    Url = 5,
    Attach = 6,
    Open = 7,
    Emoji = 8,
    VoiceRemind = 9,
    ScanGood = 10,
    Good = 13,
    Emotion = 15,
    CardTicket = 16,
    RealtimeShareLocation = 17,
    ChatHistory = 19,
    MiniProgram = 33,
    MiniProgramApp = 36, // this is forwardable mini program
    Channels = 51, // 视频号
    GroupNote = 53,
    ReferMsg = 57,
    Transfers = 2000,
    RedEnvelopes = 2001,
    ReaderType = 100001,
}