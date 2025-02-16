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
        url?: string,
        callbackData: string
    },
    editMsg?: boolean
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
        url?: string,
        callbackData: string
    },
    editMsg?: boolean
) {
    paginationMap[queryKey] = {
        fetchData,
        renderButton,
        editMsg,
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
    extraMessage?: Record<string, any>,
) {
    const handler = paginationMap[queryKey]
    if (!handler) {
        await ctx.reply(`未找到 queryKey = ${queryKey} 对应的分页配置！`)
        return
    }

    const {pageNo, pageSize, columns} = pageParam

    const {fetchData, renderButton, editMsg} = handler

    return new Promise(resolve => {
        fetchData(pageNo, pageSize, extraMessage).then((page) => {
                let text = ''
                if (extraMessage?.keyword) {
                    text += `搜索关键词: ${extraMessage.keyword}\n`
                }
                text += `当前页: ${pageNo}, 每页: ${pageSize}, 总数: ${page?.total ?? 0}\n\n`

                // 根据 renderButton 返回值判断是否生成 url 按钮或回调按钮
                const itemButtons = page.data?.map((item, index) => {
                    const {text: btnText, callbackData, url} = renderButton(item, index, pageNo, pageSize)

                    if (url) {
                        // 如果有url，使用 url 类型的按钮
                        return Markup.button.url(btnText, url)
                    } else {
                        // 如果没有 url，使用 callback 类型的按钮
                        return Markup.button.callback(btnText, callbackData)
                    }
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

                // @ts-ignore
                if (editMsg && !ctx?.command) {
                    ctx.editMessageReplyMarkup({
                        inline_keyboard: chunkedItemButtons
                    }).then(res => {
                        resolve(res)
                    })
                } else {
                    ctx.reply(
                        text,
                        Markup.inlineKeyboard(chunkedItemButtons)
                    ).then(res => {
                        LogUtils.debug('sendPagedList: %s', res)
                        resolve(res)
                    }).catch((err) => {
                        LogUtils.error(err)
                    })
                }
            }
        )

    })

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
            // const msgId = parseInt(ctx.match[5], 10)
            // @ts-ignore
            const extraMsg = ctx.session[queryKey + 'extraData'] || {}

            sendPagedList(ctx, queryKey, {
                pageNo,
                pageSize,
                columns,
            }, {
                ...extraMsg
            }).then(() => {
                ctx.answerCbQuery()
            })
        } catch (err) {
            LogUtils.error(err)
            ctx.answerCbQuery('分页回调出错')
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
    for (let i = 0; i < arr?.length; i += size) {
        result.push(arr.slice(i, i + size))
    }
    return result
}
