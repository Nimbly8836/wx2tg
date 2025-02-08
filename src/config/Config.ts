import dotenv, {config} from 'dotenv'

config()

export const ConfigEnv = {
    BOT_TOKEN: process.env.BOT_TOKEN || '',
    API_ID: process.env.API_ID || '',
    API_HASH: process.env.API_HASH || '',
    PROXY_CONFIG: {
        type: process.env.PROXY_TYPE,
        host: process.env.PROXY_HOST,
        port: process.env.PROXY_PORT,
        username: process.env.PROXY_USERNAME,
        password: process.env.PROXY_PASSWORD,
        hasProxy: !!(process.env.PROXY_HOST && process.env.PROXY_PORT),
    } as ProxyOptions,
    BASE_API: process.env.BASE_API || '',
    FILE_API: process.env.FILE_API || '',
    LOG_LEVEL: process.env.LOG_LEVEL || 'info',
}

export type ProxyOptions = {
    host: string,
    port: string,
    username?: string,
    password?: string,
    type: string,
    hasProxy?: boolean,
}

export type SettingOptions = {

}