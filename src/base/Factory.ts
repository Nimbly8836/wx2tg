import {AbstractClient} from "./AbstractClient";
import {ClientEnum} from "../constant/ClientConstants";
import BotClient from "../client/BotClient";
import {WeChatClient} from "../client/WeChatClient";

export class SimpleClientFactory {

    static getSingletonClient(clientEnum: ClientEnum): AbstractClient {
        switch (clientEnum) {
            case ClientEnum.TG_BOT:
                return BotClient.getInstance();
            case ClientEnum.WX_BOT:
                return WeChatClient.getInstance();
            case ClientEnum.TG_USER:
                break
            default:
                break
        }
    }

}
