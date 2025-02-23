import dotenv, {config} from 'dotenv'

config()

export const ConfigEnv = {
    BOT_TOKEN: process.env.BOT_TOKEN || '',
    API_ID: Number(process.env.API_ID),
    API_HASH: process.env.API_HASH || '',
    OWNER_ID: Number(process.env.OWNER_ID),
    PROXY_CONFIG: {
        type: process.env.PROXY_TYPE,
        host: process.env.PROXY_HOST,
        port: Number(process.env.PROXY_PORT),
        username: process.env.PROXY_USERNAME,
        password: process.env.PROXY_PASSWORD,
        hasProxy: !!(process.env.PROXY_HOST && process.env.PROXY_PORT),
        link: process.env.PROXY_TYPE + '://' + process.env.PROXY_HOST + ':' + process.env.PROXY_PORT
    } as ProxyOptions,
    BASE_API: process.env.BASE_API || '',
    FILE_API: process.env.FILE_API || '',
    LOG_LEVEL: process.env.LOG_LEVEL || 'default',
    GEWE_PORT: Number(process.env.GEWE_PORT) || 3000,
    GEWE_PROXY: process.env.GEWE_PROXY || '',
    GEWE_STATIC: process.env.GEWE_STATIC || 'storage',
}

export type ProxyOptions = {
    host: string,
    port: number,
    username?: string,
    password?: string,
    type: string,
    hasProxy?: boolean,
    link?: string
}

export type SettingOptions = {}