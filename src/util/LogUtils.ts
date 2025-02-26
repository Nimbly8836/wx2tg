import log4js, {Logger} from 'log4js'
import {ConfigEnv} from "../config/Config";

export class LogUtils {

    private static logger: Logger;
    private constructor() {
        ///
    }

    public static getLogger(): Logger {
        LogUtils.config()
        return LogUtils.logger;
    }

    public static config() {
        if (!LogUtils.logger) {
            log4js.configure({
                appenders: {
                    console: { type: 'console' },
                    file: { type: 'file', filename: 'logs/app.log', maxLogSize: '5M', backups: 5 },
                    errorFile: { type: 'file', filename: 'logs/error.log', maxLogSize: '5M', backups: 5 },
                    logLevelFilter: {
                        type: 'logLevelFilter',
                        appender: 'errorFile',
                        level: 'error'
                    }
                },
                categories: {
                    default: { appenders: ['console', 'file', 'logLevelFilter'], level: 'info' },
                    dev: { appenders: ['console', 'file', 'logLevelFilter'], level: 'debug' },
                    pro: { appenders: ['console', 'file', 'logLevelFilter'], level: 'warn' },
                    error: { appenders: ['errorFile'], level: 'error' }
                }
            });
            LogUtils.logger = log4js.getLogger(ConfigEnv.LOG_LEVEL);
        }
    }

    public static setCategory(category: 'error' | 'default' | 'dev' | 'pro') {
        LogUtils.config();
        LogUtils.logger = log4js.getLogger(category);
    }

    public static error(message: any, ...args: any[]) {
        LogUtils.config();
        LogUtils.logger.error(message, ...args);
    }

    public static info(message: any, ...args: any[]) {
        LogUtils.config();
        LogUtils.logger.info(message, ...args);
    }

    public static debug(message: any, ...args: any[]) {
        LogUtils.config();
        LogUtils.logger.debug(message, ...args);
    }

    public static warn(message: any, ...args: any[]) {
        LogUtils.config();
        LogUtils.logger.warn(message, ...args);
    }
}