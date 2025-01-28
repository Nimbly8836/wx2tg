export default interface IClient {
    login(): Promise<boolean>
    logout(): Promise<boolean>
    sendMessage(any: any): Promise<boolean>
    onMessage(any: any): Promise<any>
}