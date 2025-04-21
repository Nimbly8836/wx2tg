import {Markup} from "telegraf";

export type SettingType = {
    /** 屏蔽公众号消息 */
    blockPublicMessages: boolean,
    /** 屏蔡表情包 */
    blockStickers: boolean,
    /** 屏蔽自己在微信客户端发送的消息 */
    blockYouSelfMessage: boolean,
}

export const defaultSetting: SettingType = {
    blockPublicMessages: true,
    blockStickers: false,
    blockYouSelfMessage: false,
}

export const SettingValues = {
    blockPublicMessages: '屏蔽公众号消息',
    blockStickers: '屏蔽表情包',
    blockYouSelfMessage: '屏蔽自己发送的消息',
}

export function getButtons(setting: SettingType) {
    let inlineKeyboard = [];

    for (const key in setting) {
        const value = setting[key as keyof SettingType];
        const buttonText = `${SettingValues[key]} (${value ? '开启' : '关闭'})`;

        const callbackData = `setting:${key}`;


        inlineKeyboard.push([
            Markup.button.callback(buttonText, callbackData)]);
    }

    return inlineKeyboard;
}
