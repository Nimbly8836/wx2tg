import {Singleton} from "../base/IService";
import {ConfigEnv} from "../config/Config";
import {Database} from "sqlite3";
import {WxConcat, WxRoom} from "../entity/WeChatSqlite";
import {PrismaClient} from "@prisma/client";
import {Constants} from "../constant/Constants";
import {updateGroupHeadImg} from "./UserClientHelper";
import {LogUtils} from "../util/LogUtils";


export default class PrismaService extends Singleton<PrismaService> {

    public prisma: PrismaClient;

    constructor() {
        super();
        if (ConfigEnv.LOG_LEVEL === 'debug') {
            this.prisma = new PrismaClient({
                log: ['query', 'info', 'warn', "error"]
            })
        }
        this.prisma = new PrismaClient({
            log: ['error']
        })
    }

    public config() {
        return this.prisma.config
    }

    public async getConfigByToken() {
        return this.prisma.config.findFirst({
            where: {
                bot_token: ConfigEnv.BOT_TOKEN
            }
        })
    }


    public async createOrUpdateWxConcatAndRoom(wxid?: string) {
        if (!wxid) {
            wxid = (await this.getConfigByToken())?.login_wxid
        }
        if (!wxid) {
            LogUtils.warn('createOrUpdateWxConcatAndRoom wxid is null')
            return
        }
        const sqliteDatabase = new Database(`${Constants.GEWE_PATH}/${wxid}.db`)
        sqliteDatabase.all<WxConcat>('SELECT * FROM contact', (err, rows) => {
            if (rows) {
                this.prisma.wx_contact.createManyAndReturn({
                    data: rows.map(r => {
                        return {
                            wx_id: wxid,
                            ...r
                        }
                    }),
                    skipDuplicates: true,
                }).then(insertContacts => {
                    // 跳过的尝试更新
                    const filter = rows.filter(r => insertContacts.find(ic => ic.userName === r.userName));
                    const updateWithWxId = filter.map(r => {
                        return {
                            wx_id: wxid,
                            ...r
                        }
                    })
                    this.prisma.wx_contact.updateMany({
                        where: {wx_id: wxid},
                        data: updateWithWxId,
                    })
                })
            }
        })
        sqliteDatabase.all<WxRoom>('SELECT * FROM room where chatroomId is not null', (err, rows) => {
            if (rows) {
                this.prisma.wx_room.createManyAndReturn({
                    data: rows.map(r => {
                        return {
                            wx_id: wxid,
                            ...r
                        }
                    }),
                    skipDuplicates: true,
                }).then(insertRooms => {
                    // 跳过的尝试更新
                    const filter = rows.filter(r => insertRooms.find(ir => ir.chatroomId === r.chatroomId));
                    const updateWithWxId = filter.map(r => {
                        return {
                            wx_id: wxid,
                            ...r
                        }
                    })
                    this.prisma.wx_room.updateMany({
                        where: {wx_id: wxid},
                        data: updateWithWxId,
                    })
                })
            }
        })

        sqliteDatabase.close()
    }

    public async pageWxContact(queryName: string, take: number | 10, skip: number | 0) {
        if (queryName) {
            return this.prisma.wx_contact.findMany({
                where: {
                    OR: [
                        {nickName: {contains: queryName}},
                        {pyInitial: {contains: queryName}},
                        {quanPin: {contains: queryName}},
                        {remark: {contains: queryName}},
                        {remarkPyInitial: {contains: queryName}},
                        {remarkQuanPin: {contains: queryName}},
                    ]
                },
                take: take,
                skip: skip
            })
        } else {
            return this.prisma.wx_contact.findMany({
                take: take,
                skip: skip
            })
        }
    }

    public async countWxContact(queryName: string) {
        if (queryName) {
            return this.prisma.wx_contact.count({
                where: {
                    OR: [
                        {nickName: {contains: queryName}},
                        {pyInitial: {contains: queryName}},
                        {quanPin: {contains: queryName}},
                        {remark: {contains: queryName}},
                        {remarkPyInitial: {contains: queryName}},
                        {remarkQuanPin: {contains: queryName}},
                    ],
                },
            })
        } else {
            return this.prisma.wx_contact.count()
        }
    }

    public async pageWxRoom(queryName: string, take: number | 10, skip: number | 0) {
        if (queryName) {
            return this.prisma.wx_room.findMany({
                where: {
                    OR: [
                        {nickName: {contains: queryName}},
                        {pyInitial: {contains: queryName}},
                        {quanPin: {contains: queryName}},
                        {remark: {contains: queryName}},
                        {remarkPyInitial: {contains: queryName}},
                        {remarkQuanPin: {contains: queryName}},
                    ]
                },
                take: take,
                skip: skip
            })
        } else {
            return this.prisma.wx_room.findMany({
                take: take,
                skip: skip
            })
        }
    }

    public async countWxRoom(queryName: string) {
        if (queryName) {
            return this.prisma.wx_room.count({
                where: {
                    OR: [
                        {nickName: {contains: queryName}},
                        {pyInitial: {contains: queryName}},
                        {quanPin: {contains: queryName}},
                        {remark: {contains: queryName}},
                        {remarkPyInitial: {contains: queryName}},
                        {remarkQuanPin: {contains: queryName}},
                    ],
                },
            })
        } else {
            return this.prisma.wx_room.count()
        }
    }

    public async pageMessageContent(contentText: string, take: number | 10, skip: number | 0, groupId?: number) {
        if (contentText) {
            return this.prisma.message.findMany({
                where: {
                    content: {contains: contentText},
                    group_id: groupId
                },
                include: {
                    group: true
                },
                take: take,
                skip: skip
            })
        }
    }

    public async countMessageContent(contentText: string, groupId?: number) {
        if (contentText) {
            return this.prisma.message.count({
                where: {
                    content: {contains: contentText},
                    group_id: groupId
                }
            })
        }
    }

    public async syncRoomDb(chatRoomId: string) {
        return this.getConfigByToken().then(config => {
            const sqliteDatabase = new Database(`${Constants.GEWE_PATH}/${config.login_wxid}.db`)
            sqliteDatabase.get<WxRoom>('SELECT * FROM room WHERE chatroomId = ?', [chatRoomId], (err, row) => {
                if (row) {
                    this.prisma.wx_room.upsert({
                        where: {
                            wx_id_chatroomId: {
                                wx_id: config.login_wxid,
                                chatroomId: row.chatroomId
                            }
                        },
                        update: {
                            ...row
                        }, create: {
                            wx_id: config.login_wxid,
                            ...row
                        },
                        include: {
                            group: true
                        }
                    }).then((r) => {
                        sqliteDatabase.close()
                    })
                }
            })

        })

    }

    public async syncContactDb(userName: string) {
        return this.getConfigByToken().then(config => {
            const sqliteDatabase = new Database(`${Constants.GEWE_PATH}/${config.login_wxid}.db`)
            sqliteDatabase.get<WxConcat>('SELECT * FROM contact WHERE userName = ?', [userName], (err, row) => {
                if (row) {
                    this.prisma.wx_contact.upsert({
                        where: {
                            wx_id_userName: {
                                wx_id: config.login_wxid,
                                userName: row.userName
                            }
                        },
                        update: {
                            ...row
                        }, create: {
                            wx_id: config.login_wxid,
                            ...row
                        }
                    }).then(() => {
                        sqliteDatabase.close()
                    })
                }
            })

        })
    }
}