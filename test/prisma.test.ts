import {PrismaClient} from '@prisma/client'
import {LogUtils} from "../src/util/LogUtils";

export const prisma = new PrismaClient({
    log: ['query', 'info', 'warn', 'error'],
})

describe('example test with Prisma Client', () => {
    // beforeAll(async () => {
    //     await prisma.message.deleteMany({})
    //     await prisma.user.deleteMany({})
    // })
    // afterAll(async () => {
    //     await prisma.$disconnect()
    // })

    test('create a group', async () => {
        // await prisma.$connect()
        // const group = await prisma.group.create({
        //     data: {
        //         // id: 1,
        //         tg_id: '123',
        //         wx_id: 'wx123',
        //         group_name: 'test group',
        //         forward: 1,
        //         allow_ids: ['111', '222', '333'],
        //     }
        // }).then(group => {
        //     console.log(group)
        // }).catch(e => {
        //     console.error(e)
        // })
        // console.log(group)
    })

    test('get all groups', async () => {
        prisma.$connect()
        const groups = await prisma.group.findMany()
        LogUtils.info('+++++++',groups)
    })

    test('get config bigInt', async () => {
        prisma.config.findFirst({where: {id: 2}}).then(config => {
            LogUtils.info('++++++',config)
        })
    })

})