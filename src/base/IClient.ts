import {SendMessage} from "./IMessage";

export default interface IClient {
    bot: any

    login(): Promise<boolean>

    logout(): Promise<boolean>

    sendMessage(msg: SendMessage): Promise<Record<string, any>>

    onMessage(any: any): void

    hasLogin: boolean,
    ready: boolean,
}