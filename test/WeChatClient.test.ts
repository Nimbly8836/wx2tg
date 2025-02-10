import {WxClient} from "../src/client/WxClient";

describe('WeChat Client Test', () => {
    test('login', async () => {
        let weChatClient = WxClient.getInstance();
        weChatClient.login().then(() => {
            console.log('login success')
        })
    })
})