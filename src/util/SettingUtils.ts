import {Markup} from "telegraf";

export type SettingType = {
    /** 屏蔽公众号消息 */
    blockPublicMessages: boolean | true,
    /** 屏蔡表情包 */
    blockStickers: boolean | false,
}

export const defaultSetting: SettingType = {
    blockPublicMessages: true,
    blockStickers: false,
}

export const SettingValues = {
    blockPublicMessages: '屏蔽公众号消息',
    blockStickers: '屏蔽表情包',
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
