import {LogUtils} from "./util/LogUtils";
import {SimpleClientFactory} from "./base/Factory";
import {ClientEnum} from "./constant/ClientConstants";

let botClient = SimpleClientFactory.getSingletonClient(ClientEnum.TG_BOT);
botClient.login().then(() => {
    LogUtils.info('start success...')
})

process.on('uncaughtException', (err) => {
    LogUtils.error('wechat2Tg uncaughtException', err)
})

process.on('exit', (code) => {
    LogUtils.error('wechat2Tg exit', code)
})