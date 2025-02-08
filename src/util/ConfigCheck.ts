import {ConfigEnv} from "../config/Config";
import * as net from "node:net";
import {LogUtils} from "./LogUtils";

export default class ConfigCheck {
    public static check() {
        const missingEnvVariables = requiredEnvVariables.filter(envVar => !process.env[envVar]);

        if (missingEnvVariables.length > 0) {
            throw new Error(`Missing required environment variables: ${missingEnvVariables.join(', ')}`);
        }
    }

    public static async networkCheck() {
        if (ConfigEnv.PROXY_CONFIG.hasProxy) {
            const {host, port} = ConfigEnv.PROXY_CONFIG;
            try {
                await ConfigCheck.checkServerConnection(host, parseInt(port));
                LogUtils.info('Proxy connection successful');
            } catch (error) {
                throw new Error(`Failed to connect to proxy: ${error}`);
            }
        }
    }

    private static checkServerConnection(host: string, port: number): Promise<void> {
        return new Promise((resolve, reject) => {
            const socket = new net.Socket();
            socket.setTimeout(5000); // 5 seconds timeout

            socket.on('connect', () => {
                socket.end();
                resolve();
            });

            socket.on('timeout', () => {
                socket.destroy();
                reject(new Error('Connection timed out'));
            });

            socket.on('error', (err) => {
                reject(err);
            });

            socket.connect(port, host);
        });
    }
}
const requiredEnvVariables: string[] = ['BOT_TOKEN', 'API_ID', 'API_HASH'];

