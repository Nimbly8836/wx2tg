export type TgChatMessage = {
    chadId: number,
    msgId: number,
}

export class TgMessageUtils {
    static messages: TgChatMessage [] = []

    static addMessage(chatId: number, msgId: number) {
        this.messages.push({chadId: chatId, msgId: msgId})
    }

    static removeMessage(chatId: number, msgId: number) {
        this.messages = this.messages.filter(m => m.chadId !== chatId && m.msgId !== msgId)
    }

    static popMessage(chatId: number, msgId: number) {
        const index = this.messages.findIndex(m => m.chadId === chatId && m.msgId === msgId)
        if (index !== -1) {
            return this.messages.splice(index, 1);
        }
    }
}