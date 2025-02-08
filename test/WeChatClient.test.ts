import {WeChatClient} from "../src/client/WeChatClient";

describe('WeChat Client Test', () => {
    test('login', async () => {
        let weChatClient = WeChatClient.getInstance();
        weChatClient.login().then(() => {
            console.log('login success')
        })
    })
})