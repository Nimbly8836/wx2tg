import PrismaService from "../service/PrismaService";

export const groupIds = new Set<number>()

export function initGroupIds() {
    PrismaService.getInstance(PrismaService).prisma.group.findMany({
        where: {
            forward: true
        }
    }).then(groups => {
        groups.forEach(group => {
            groupIds.add(Number(group.tg_group_id))
        })
    })
}

export function addToGroupIds(groupId: number) {
    groupIds.add(groupId)
}

export function removeFromGroupIds(groupId: number) {
    groupIds.delete(groupId)
}