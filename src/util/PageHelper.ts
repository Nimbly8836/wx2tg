import {Telegraf, Context} from 'telegraf'
import {Markup} from 'telegraf'
import {LogUtils} from "./LogUtils";
import {PageParam} from "../entity/Makeup";

/**
 * 通用的分页结果
 */
export interface PagedResult<T> {
    data: T[]
    total: number
}

/**
 * 用于分页的核心处理器：
 * - fetchData: 根据 pageNo/pageSize/queryParams 获取数据
 * - renderButton: 将单条数据生成一个可点击的 inline button
 */
export interface PaginationHandler<T> {
    fetchData: (pageNo: number, pageSize: number, queryParams?: Record<string, any>) => Promise<PagedResult<T>>
    renderButton: (item: T, index: number, pageNo: number, pageSize: number) => {
        text: string,
        callbackData: string
    }
}

/**
 * 全局的分页处理器管理 Map
 */
export const paginationMap: Record<string, PaginationHandler<any>> = {}

/**
 * 注册分页（初始化时调用）
 */
export function registerPagination<T>(
    queryKey: string,
    fetchData: (pageNo: number, pageSize: number, queryParams?: Record<string, any>) => Promise<PagedResult<T>>,
    renderButton: (item: T, index: number, pageNo: number, pageSize: number) => {
        text: string,
        callbackData: string
    }
) {
    paginationMap[queryKey] = {
        fetchData,
        renderButton,
    }
}

/**
 * 发送分页列表
 * @param ctx 上下文
 * @param queryKey 唯一标识
 * @param pageParam 分页参数
 * @param extraMessage 其他需要传递的参数（例如 keyword、columns）
 */
export async function sendPagedList<T>(
    ctx: Context,
    queryKey: string,
    pageParam: PageParam,
    extraMessage?: Record<string, any>
) {
    const handler = paginationMap[queryKey]
    if (!handler) {
        await ctx.reply(`未找到 queryKey = ${queryKey} 对应的分页配置！`)
        return
    }

    const {pageNo, pageSize, columns} = pageParam

    const {fetchData, renderButton} = handler
    const page = await fetchData(pageNo, pageSize, extraMessage)

    let text = ''
    if (extraMessage?.keyword) {
        text += `搜索关键词: ${extraMessage.keyword}\n`
    }
    text += `当前页: ${pageNo}, 每页: ${pageSize}, 总数: ${page.total}\n\n`

    // renderButton 会返回 { text: string, callbackData: string }
    const itemButtons = page.data.map((item, index) => {
        const {text: btnText, callbackData} = renderButton(item, index, pageNo, pageSize)
        return Markup.button.callback(btnText, callbackData)
    })

    const chunkedItemButtons = chunkArray(itemButtons, columns)

    const paginationButtons = []
    if (pageNo > 1) {
        paginationButtons.push(
            Markup.button.callback('上一页', `paging:${queryKey}:${pageNo - 1}:${pageSize}:${columns}`)
        )
    }
    if (pageNo * pageSize < page.total) {
        paginationButtons.push(
            Markup.button.callback('下一页', `paging:${queryKey}:${pageNo + 1}:${pageSize}:${columns}`)
        )
    }
    // 如果有上一页或下一页按钮，则再加一行
    if (paginationButtons.length > 0) {
        chunkedItemButtons.push(paginationButtons)
    }

    await ctx.reply(
        text,
        Markup.inlineKeyboard(chunkedItemButtons)
    )
}

/**
 * 初始化通用分页回调：拦截 paging:xx:xx:xx:xx 的回调，执行翻页
 */
export function initPaginationCallback(bot: Telegraf) {
    bot.action(/^paging:(.*):(.*):(.*):(.*)$/, async (ctx) => {
        try {
            const queryKey = ctx.match[1] as string
            const pageNo = parseInt(ctx.match[2], 10)
            const pageSize = parseInt(ctx.match[3], 10)
            const columns = parseInt(ctx.match[4], 10)

            await sendPagedList(ctx, queryKey, {
                pageNo,
                pageSize,
                columns
            })

            // 避免按钮一直显示 loading
            await ctx.answerCbQuery()
        } catch (err) {
            LogUtils.error(err)
            await ctx.answerCbQuery('分页回调出错')
        }
    })
}

/**
 * 将一维数组按指定 size 进行分组
 * @param arr 原数组
 * @param size 每个小组的大小
 */
function chunkArray<T>(arr: T[], size: number): T[][] {
    const result: T[][] = []
    for (let i = 0; i < arr.length; i += size) {
        result.push(arr.slice(i, i + size))
    }
    return result
}
