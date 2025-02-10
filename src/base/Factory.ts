import {AbstractClient} from "./AbstractClient";
import {ClientEnum} from "../constant/ClientConstants";
import BotClient from "../client/BotClient";
import {WxClient} from "../client/WxClient";

export class SimpleClientFactory {

    static getSingletonClient(clientEnum: ClientEnum): AbstractClient<any> {
        switch (clientEnum) {
            case ClientEnum.TG_BOT:
                return BotClient.getInstance() as BotClient;
            case ClientEnum.WX_BOT:
                return WxClient.getInstance() as WxClient;
            case ClientEnum.TG_USER:
                break
            default:
                break
        }
    }

}
