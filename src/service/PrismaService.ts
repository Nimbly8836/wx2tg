import {Singleton} from "../base/IService";
import {ConfigEnv} from "../config/Config";
import {Database} from "sqlite3";
import {WxConcat, WxRoom} from "../entity/WeChatSqlite";
import {PrismaClient} from "../generated/client";


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


    public async createOrUpdateWxConcatAndRoom(wxid: string) {
        const sqliteDatabase = new Database(`${wxid}.db`)
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
        sqliteDatabase.all<WxRoom>('SELECT * FROM room', (err, rows) => {
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

}