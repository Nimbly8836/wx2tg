import {LogUtils} from "../util/LogUtils";
import {Logger} from "log4js";

export default interface IService {
    logger: Logger,

    logInfo(message: any, ...args: any[]): void,

    logError(message: any, ...args: any[]): void,

    logDebug(message: any, ...args: any[]): void,
}

export abstract class AbstractService implements IService {
    logger: Logger;

    protected constructor() {
        this.logger = LogUtils.getLogger();
    }

    logDebug(message: any, ...args: any[]): void {
        this.logger.debug(message, ...args);
    }

    logError(message: any, ...args: any[]): void {
        this.logger.error(message, ...args);
    }

    logInfo(message: any, ...args: any[]): void {
        this.logger.info(message, ...args);
    }
}

export abstract class Singleton<T> extends AbstractService {
    protected static instance: any;

    protected constructor() {
        super()
    }

    public static getInstance<T>(that: new () => T): T {
        if (!this.instance) {
            this.instance = new that();
        }
        return this.instance;
    }

}


