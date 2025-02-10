import BotClient from "../client/BotClient";
import {WxClient} from "../client/WxClient";
import TgClient from "../client/TgClient";

export enum ClientEnum {
    TG_BOT = 'tgBot',
    WX_BOT = 'wx',
    TG_USER = 'tgUser',
}

export const ClientProperties = {
    [ClientEnum.TG_BOT]: {name: 'tgBot', client: BotClient, getClient: () => BotClient.getInstance()},
    [ClientEnum.WX_BOT]: {name: 'wx', client: WxClient, getClient: () => WxClient.getInstance()},
    [ClientEnum.TG_USER]: {name: 'tgUser', client: TgClient, getClient: () => TgClient.getInstance()},
};

export function getClientByEnum(clientEnum: ClientEnum) {
    return ClientProperties[clientEnum].getClient()

}