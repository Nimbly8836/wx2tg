import IClient from "./IClient";
import {LogUtils} from "../util/LogUtils";
import {Logger} from "log4js";
import IService from "./IService";
import {SendMessage} from "./IMessage";
import {ClientEnum} from "../constant/ClientConstants";

export abstract class AbstractClient implements IClient, IService {
    logger: Logger;
    bot: any;

    protected spyClients: Map<ClientEnum, AbstractClient> = new Map<ClientEnum, AbstractClient>();

    ready: boolean = false;
    hasLogin: boolean = false;

    protected constructor() {
        this.logger = LogUtils.getLogger();
    }

    abstract login(): Promise<boolean>

    abstract logout(): Promise<boolean>

    abstract sendMessage(msgParams: SendMessage): Promise<object>

    abstract onMessage(any: any): void

    logDebug(message: any, ...args: any[]): void {
        this.logger.debug(message, ...args);
    }

    logError(message: any, ...args: any[]): void {
        this.logger.error(message, ...args);
    }

    logInfo(message: any, ...args: any[]): void {
        this.logger.info(message, ...args);
    }

    protected static instance: AbstractClient | null = null;
}