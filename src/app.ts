import {LogUtils} from "./util/LogUtils";
import {SimpleClientFactory} from "./base/Factory";
import {ClientEnum} from "./constant/ClientConstants";
import BotClient from "./client/BotClient";
import ConfigCheck from "./util/ConfigCheck";
import {WxClient} from "./client/WxClient";


try {
    ConfigCheck.check()
} catch (e) {
    LogUtils.error(e)
    process.exit(2)
}
let botClient = SimpleClientFactory.getSingletonClient(ClientEnum.TG_BOT) as BotClient;
botClient.start().then(() => {
    LogUtils.info('start success...')
})

process.on('uncaughtException', (err) => {
    LogUtils.error('wx2Tg uncaughtException', err)
})

const originalExit = process.exit;

// @ts-ignore
process.exit = (code) => {
    if (code === 1) {
        WxClient.getInstance().check().then(check => {
            if (!check) {
                botClient.sendMessage({
                    msgType: 'text',
                    content: '微信客户端出现异常，可能丢失消息。\n' +
                        '可以使用 /check 查看微信是否在线 \n' +
                        '如果连接异常，可以使用 /rmds （删除缓存）后重启应用',
                    record: false,
                }).then()
            }
            LogUtils.error('gewechat process.exit code 1')
        })

    } else {
        originalExit(code);
    }
};

