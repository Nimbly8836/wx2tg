export enum ClientEnum {
    TG_BOT = 'tgBot',
    WX_BOT = 'wx',
    TG_USER = 'tgUser',
}

export const ClientProperties = {
    [ClientEnum.TG_BOT]: {name: 'tgBot', isSingleton: true},
    [ClientEnum.WX_BOT]: {name: 'wx', isSingleton: true},
    [ClientEnum.TG_USER]: {name: 'tgUser', isSingleton: true},
};