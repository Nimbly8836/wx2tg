import "reflect-metadata";
import {LogUtils} from "./util/LogUtils";
import {ClientEnum, getClientByEnum} from "./constant/ClientConstants";
import BotClient from "./client/BotClient";
import ConfigCheck from "./util/ConfigCheck";
import {WxClient} from "./client/WxClient";
import { getService } from "./di";

// 确保容器已初始化
console.log("Application starting...");

try {
    ConfigCheck.check()
} catch (e) {
    LogUtils.error(e)
    process.exit(2)
}

// 使用工厂函数获取BotClient实例
let botClient = getService(BotClient);
console.log("BotClient resolved from container");

// 启动应用
botClient.start().then(() => {
    LogUtils.info('start success...')
}).catch(err => {
    LogUtils.error('Failed to start application:', err);
    process.exit(1);
});

process.on('uncaughtException', (err) => {
    LogUtils.error('wx2Tg uncaughtException', err)
})

