import {LogUtils} from "./util/LogUtils";
import {SimpleClientFactory} from "./base/Factory";
import {ClientEnum} from "./constant/ClientConstants";
import BotClient from "./client/BotClient";
import * as fs from "node:fs";

let botClient = SimpleClientFactory.getSingletonClient(ClientEnum.TG_BOT) as BotClient;
botClient.start().then(() => {
    LogUtils.info('start success...')
})

process.on('uncaughtException', (err) => {
    LogUtils.error('wechat2Tg uncaughtException', err)
})

const originalExit = process.exit;

// @ts-ignore
process.exit = (code) => {
    if (code === 1) {
        LogUtils.error("gewechaty exit with code 1");
        // 删除 ds.json 文件
        // if (fs.existsSync('ds.json')) {
        //     fs.unlinkSync('ds.json');
        // }
        botClient.sendMessage({
            msgType: 'text',
            content: '微信客户端出现异常，已退出。\n' +
                '如果无法连接，请使用 rmds 命令删除 ds.json 文件并且手动退出 iPad 客户端后重试',
        })

    } else {
        originalExit(code);
    }
};

