export const quoteAppMsg = (msg: {
    title: string,
    content: string,
    newMsgId: string,
    toWxId: string,
}) => {
    const {title, content, newMsgId, toWxId} = msg
    return `<appmsg appid="" sdkver="0"><title>${title}</title><des /><action /><type>57</type><showtype>0</showtype><soundtype>0</soundtype><mediatagname /><messageext /><messageaction /><content /><contentattr>0</contentattr><url /><lowurl /><dataurl /><lowdataurl /><songalbumurl /><songlyric /><appattach><totallen>0</totallen><attachid /><emoticonmd5 /><fileext /><aeskey /></appattach><extinfo /><sourceusername /><sourcedisplayname /><thumburl /><md5 /><statextstr /><refermsg><content>${content}</content><type>1</type><svrid>${newMsgId}</svrid><chatusr>${toWxId}</chatusr></refermsg></appmsg>`
}