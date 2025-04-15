import BotClient from "../client/BotClient";
import {WxClient} from "../client/WxClient";
import TgClient from "../client/TgClient";
import {container} from "tsyringe";

export enum ClientEnum {
    TG_BOT = 'tgBot',
    WX_BOT = 'wx',
    TG_USER = 'tgUser',
}

export const ClientProperties = {
    [ClientEnum.TG_BOT]: {name: 'tgBot', client: BotClient, getClient: () => container.resolve(BotClient)},
    [ClientEnum.WX_BOT]: {name: 'wx', client: WxClient, getClient: () => container.resolve(WxClient)},
    [ClientEnum.TG_USER]: {name: 'tgUser', client: TgClient, getClient: () => container.resolve(TgClient)},
};

export function getClientByEnum(clientEnum: ClientEnum) {
    return ClientProperties[clientEnum].getClient()
}