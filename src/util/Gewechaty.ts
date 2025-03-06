import os from "os";
import {ConfigEnv} from "../config/Config";

export const getLocalIPAddress = () => {
    const interfaces = os.networkInterfaces();
    let localIPAddress = '';
    for (let interfaceName in interfaces) {
        const addresses = interfaces[interfaceName];
        for (let i = 0; i < addresses.length; i++) {
            const addressInfo = addresses[i];

            // 确保选择的是 IPv4，并且不是本地环回接口
            if (addressInfo.family === 'IPv4' && !addressInfo.internal) {
                // 排除虚拟网络的IP地址
                if (addressInfo.address.startsWith('192.') || addressInfo.address.startsWith('10.') || addressInfo.address.startsWith('172.')) {
                    localIPAddress = addressInfo.address;
                    break;
                }
            }
        }
    }
    return localIPAddress;
}

export const getBaseHttpAddress = () => {
    const geweip = ConfigEnv.GEWE_IP ?? getLocalIPAddress();
    return `http://${geweip}:${ConfigEnv.GEWE_PORT}`
}