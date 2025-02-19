import DS from 'ds';
import {Constants} from "../constant/Constants";

const ds = new DS(Constants.GEWE_DS);

export const getToken = () => {
    return ds.token || ''
}

export const getAppId = () => {
    return ds.appid || ''
}

export const getUuid = () => {
    return ds.uuid || ''
}