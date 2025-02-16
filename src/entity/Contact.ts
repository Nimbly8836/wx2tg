export type Contact = {
    id: string,
    nickname: string,
    alias: string,
    showName: string,
    avatar: string,
}

export type RoomMemberType = {
    "wxid": string,
    "nickName": string,
    "inviterUserName": string,
    "memberFlag": number,
    "displayName": string,
    "bigHeadImgUrl": string,
    "smallHeadImgUrl": string,
}