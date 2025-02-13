import axios, {AxiosRequestConfig} from 'axios'
import {ConfigEnv} from "../config/Config";
import {HttpsProxyAgent} from "https-proxy-agent";
import {SocksProxyAgent} from "socks-proxy-agent";
import {LogUtils} from "./LogUtils";

export default class FileUtils {

    static async downloadBuffer(fileUrl: string, useProxy?: boolean): Promise<Buffer> {
        const axiosConfig: AxiosRequestConfig = {
            method: 'GET',
            url: fileUrl,
            responseType: 'stream'
        }
        if (ConfigEnv.PROXY_CONFIG.hasProxy && useProxy) {
            if (ConfigEnv.PROXY_CONFIG.type !== 'socks5') {
                const agent = new HttpsProxyAgent(`${ConfigEnv.PROXY_CONFIG.link}`)
                axiosConfig.httpAgent = agent
                axiosConfig.httpsAgent = agent
            } else {
                const info = {
                    hostname: ConfigEnv.PROXY_CONFIG.host,
                    port: ConfigEnv.PROXY_CONFIG.port,
                    username: ConfigEnv.PROXY_CONFIG.username,
                    password: ConfigEnv.PROXY_CONFIG.password
                }
                const agent = new SocksProxyAgent(info)
                axiosConfig.httpAgent = agent
                axiosConfig.httpsAgent = agent
            }
        }

        try {
            const response = await axios({
                ...axiosConfig,
                responseType: 'arraybuffer'
            })
            const buffer = Buffer.from(response.data)
            return new Promise<Buffer>(resolve => resolve(buffer))
        } catch (error) {
            LogUtils.error('下载文件失败:', error)
            throw error
        }
    }
}