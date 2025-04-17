import BotClient from "../client/BotClient";
import {WxClient} from "../client/WxClient";
import TgClient from "../client/TgClient";
import { getService } from "../di";

export enum ClientEnum {
    TG_BOT = 'tgBot',
    WX_BOT = 'wx',
    TG_USER = 'tgUser',
}

export const ClientProperties = {
    [ClientEnum.TG_BOT]: {name: 'tgBot', client: BotClient, getClient: () => getService(BotClient)},
    [ClientEnum.WX_BOT]: {name: 'wx', client: WxClient, getClient: () => getService(WxClient)},
    [ClientEnum.TG_USER]: {name: 'tgUser', client: TgClient, getClient: () => getService(TgClient)},
};

export function getClientByEnum(clientEnum: ClientEnum) {
    return ClientProperties[clientEnum].getClient();
}