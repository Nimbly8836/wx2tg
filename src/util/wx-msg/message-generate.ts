import he from 'he'


export const quoteAppMsg = (msg: {
    title: string,
    content: string,
    newMsgId: string,
    toWxId: string,
    type?: number
}) => {
    const {title, content, newMsgId, toWxId, type} = msg
    return `<appmsg appid="" sdkver="0">
        <title>${title}</title>
    <des />
    <action />
    <type>57</type>
    <showtype>0</showtype>
    <soundtype>0</soundtype>
    <mediatagname />
    <messageext />
    <messageaction />
    <content />
    <contentattr>0</contentattr>
    <url />
    <lowurl />
    <dataurl />
    <lowdataurl />
    <songalbumurl />
    <songlyric />
    <appattach>
        <totallen>0</totallen>
    <attachid />
    <emoticonmd5 />
    <fileext />
    <aeskey />
    </appattach>
    <extinfo />
    <sourceusername />
    <sourcedisplayname />
    <thumburl />
    <md5 />
    <statextstr />
    <refermsg>
        <type>${type || 1}</type>
    <svrid>${newMsgId}</svrid>
    <fromusr>${toWxId}</fromusr>
    <chatusr>${toWxId}</chatusr>
    <displayname />
    <content>${escapeHtml(content)}</content>
    </refermsg>
    </appmsg>`
}

export function escapeHtml(text) {
    return he.encode(text);
}