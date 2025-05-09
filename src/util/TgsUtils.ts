import {spawn} from 'child_process'
import * as fs from 'node:fs'
import WxLimitConstants from "../constant/WxLimitConstant";

const lottie_to_gif = '/usr/bin/lottie_to_gif.sh'

export default class TgsUtils {
    async tgsToGif(inputFile: string, outputFile: string, lottieConfig?: {
        width?: number | 128,
        height?: number | 128,
        fps?: number | 24,
    }) {
        return new Promise((resolve, reject) => {
            const args = [lottie_to_gif, inputFile, '--output', outputFile]
            if (lottieConfig?.height) {
                args.push('--height', lottieConfig.height.toString())
            }
            if (lottieConfig?.width) {
                args.push('--width', lottieConfig.width.toString())
            }
            if (lottieConfig?.fps) {
                args.push('--fps', lottieConfig.fps.toString())
            }
            spawn('bash', args, {
                shell: true
            }).on('exit', (code, signal) => {
                if (code !== 0) {
                    reject('转换失败')
                    return
                }
                const statSync = fs.statSync(outputFile)
                if (statSync.size > WxLimitConstants.MAX_GIF_SIZE) {
                    args.push('--fps', '24')
                    const zoom = 17_000 / fs.statSync(inputFile).size
                    let quality = Math.floor(70 * zoom)
                    if (quality < 0) {
                        quality = 1
                    } else if (quality > 100) {
                        quality = 90
                    }
                    args.push('--quality', quality.toString())
                    // console.log('tgsToGif 第二次转换 args: ' + args.join(' '))
                    spawn('bash', args, {
                        shell: true
                    }).on('exit', code => {
                        if (code !== 0) {
                            // 失败去删除第一次的gif文件
                            fs.unlinkSync(outputFile)
                            reject('转换失败')
                            return
                        }
                        // 修改名字为gif
                        if (fs.statSync(outputFile).size > WxLimitConstants.MAX_GIF_SIZE) {
                            fs.unlinkSync(outputFile)
                            reject('不能压缩gif到1MB以下')
                        } else {
                            resolve(outputFile)
                        }
                    }).on('error', (error) => {
                        // 失败去删除第一次的gif文件
                        fs.unlinkSync(outputFile)
                        reject(error)
                    })
                } else {
                    resolve(outputFile)
                }
            }).on('error', (error) => {
                reject(error)
            })
        })
    }
}