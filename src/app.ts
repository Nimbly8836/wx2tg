import "reflect-metadata";
import {LogUtils} from "./util/LogUtils";
import {ClientEnum, getClientByEnum} from "./constant/ClientConstants";
import BotClient from "./client/BotClient";
import ConfigCheck from "./util/ConfigCheck";
import {WxClient} from "./client/WxClient";
import {container} from "tsyringe";


try {
    ConfigCheck.check()
} catch (e) {
    LogUtils.error(e)
    process.exit(2)
}
let botClient = container.resolve(BotClient);
botClient.start().then(() => {
    LogUtils.info('start success...')
})

process.on('uncaughtException', (err) => {
    LogUtils.error('wx2Tg uncaughtException', err)
})

const originalExit = process.exit;

// process.exit = (code) => {
//     if (code === 1) {
//         const wxClient = container.resolve(WxClient);
//         wxClient.check().then(check => {
//             if (!check) {
//                 botClient.sendMessage({
//                     msgType: 'text',
//                     content: '微信客户端出现异常，可能丢失消息。\n' +
//                         '可以使用 /check 查看微信是否在线 \n' +
//                         '如果连接异常，可以使用 /rmds （删除缓存）后重启应用',
//                     notRecord: true,
//                 }).then()
//             }
//             LogUtils.error('gewechat process.exit code 1')
//         })
//
//     } else {
//         originalExit(code);
//     }
// };

