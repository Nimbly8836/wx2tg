export type Message = {
    id?: string,
    sender: string,
    receiver: string,
    content: string,
    time: number,
    parent?: string,
}