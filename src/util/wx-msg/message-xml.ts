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
        };
        fromusername: string;
        appinfo: {
            appname: any;
        };
    };
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